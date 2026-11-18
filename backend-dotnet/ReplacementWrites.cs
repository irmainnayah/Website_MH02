using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Npgsql;
using NpgsqlTypes;

public static class ReplacementWrites
{
    private sealed record DeviceSnapshot(Guid Id, string Code, int SiteId, int BeforeStatus, int AfterStatus,
        Guid? BeforeUnit, Guid? AfterUnit, int? BeforeLocation, int? AfterLocation,
        DateOnly? BeforeMaintenance, DateOnly? AfterMaintenance, string Role, string BeforeCode, string AfterCode, bool MatchesCurrent);

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapPost("/api/replacements", async (HttpContext context, CancellationToken cancellationToken) =>
        {
            if (!AuthEndpoints.HasAllowedOrigin(context)) return Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            var key = context.Request.Headers["Idempotency-Key"].ToString();
            if (!Regex.IsMatch(key, "^[A-Za-z0-9_-]{16,64}$")) return Error(400, "IDEMPOTENCY_KEY_REQUIRED", "An Idempotency-Key of 16-64 characters is required.");
            ReplacementUploadRequest upload;
            try { upload = await ReplacementUploads.ReadAsync(context, cancellationToken); }
            catch (ReplacementUploadException error) { return Error(error.Status, error.Code, error.Message); }
            catch (BadHttpRequestException error) when (error.StatusCode == 413) { return Error(413, "REQUEST_TOO_LARGE", "The request is too large."); }
            if (!Validate(upload.Payload, out var startedLocal, out var finishedLocal, out var validationMessage))
                return Error(400, "VALIDATION_FAILED", validationMessage);
            if (!ReplacementUploads.RequiredSlots.All(slot => upload.Photos.Any(photo => photo.Slot == slot)))
                return Error(400, "PHOTO_REQUIRED", "All four required replacement photos must be uploaded.");

            var commitStarted = false;
            var createdFiles = new List<string>();
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, upload.Payload.SiteId, out var scopedSite)) return Error(403, "SITE_FORBIDDEN", "You cannot write to this Site.");
                if (scopedSite is null) return Error(400, "SITE_REQUIRED", "siteId is required for a Super Admin.");
                var siteId = scopedSite.Value;
                var hash = RequestHash(siteId, upload);
                await using (var barrier = new NpgsqlCommand("SELECT pg_advisory_xact_lock(hashtextextended(@key, 0))", connection, transaction) { CommandTimeout = 5 })
                {
                    barrier.Parameters.AddWithValue("key", $"idem:{user.UserId}:{key}");
                    await barrier.ExecuteNonQueryAsync(cancellationToken);
                }
                await using (var previous = new NpgsqlCommand("SELECT activity_type, request_hash, activity_id, form_number FROM idempotency_keys WHERE user_id = @user AND idempotency_key = @key", connection, transaction))
                {
                    previous.Parameters.AddWithValue("user", user.UserId);
                    previous.Parameters.AddWithValue("key", key);
                    await using var reader = await previous.ExecuteReaderAsync(cancellationToken);
                    if (await reader.ReadAsync(cancellationToken))
                    {
                        if (reader.GetString(0) != "replacement" || reader.GetString(1).Trim() != hash)
                            return Error(422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request.");
                        var previousId = reader.GetGuid(2);
                        var previousNumber = reader.GetString(3);
                        await reader.DisposeAsync();
                        await using var exists = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM activities WHERE activity_id = @id AND site_id = @site)", connection, transaction);
                        exists.Parameters.AddWithValue("id", previousId);
                        exists.Parameters.AddWithValue("site", siteId);
                        if (!(bool)(await exists.ExecuteScalarAsync(cancellationToken))!) return Error(409, "ALREADY_PROCESSED_AND_DELETED", "The original result no longer exists.");
                        context.Response.Headers["Idempotency-Replayed"] = "true";
                        return Results.Ok(new { activityId = previousId, formNumber = previousNumber });
                    }
                }

                var siteData = await ReadSiteAsync(connection, transaction, siteId, cancellationToken);
                if (siteData is null || !siteData.Value.Active) return Error(422, "SITE_INACTIVE", "The Site does not exist or is inactive.");
                if (!TryResolveTimeZone(siteData.Value.Zone, startedLocal, finishedLocal, out var zone, out var started, out var finished, out var startOffset, out var finishOffset, out var timeError))
                    return Error(422, "INVALID_DATETIME", timeError);
                if (!await ValidLookupsAsync(connection, transaction, siteId, upload.Payload, cancellationToken))
                    return Error(422, "LOOKUP_NOT_FOUND", "A selected dropdown value is not active for this Site.");

                var finalStatusId = await FindStatusIdAsync(connection, transaction, upload.Payload.OldFinalStatus!, cancellationToken);
                if (finalStatusId is null) return Error(422, "INVALID_OLD_DEVICE_STATUS", "The old Device final condition is not valid.");
                var old = await ReadDeviceAsync(connection, transaction, upload.Payload.OldDeviceCode!, cancellationToken);
                var replacement = await ReadDeviceAsync(connection, transaction, upload.Payload.NewDeviceCode!, cancellationToken);
                if (old is null || old.Value.SiteId != siteId || old.Value.StatusCode != "in_use" || old.Value.UnitId is null)
                    return Error(422, "OLD_DEVICE_NOT_IN_USE", "The old Device is not currently installed in this Site.");
                if (replacement is null || replacement.Value.SiteId != siteId || replacement.Value.StatusCode != "in_stock_rfu" || replacement.Value.UnitId is not null)
                    return Error(422, "NEW_DEVICE_NOT_AVAILABLE", "The new Device is not available as In Stock RFU in this Site.");
                if (old.Value.Id == replacement.Value.Id) return Error(422, "SAME_DEVICE", "The old and new Device must be different.");
                if (!await UnitIsActiveAtSiteAsync(connection, transaction, old.Value.UnitId.Value, siteId, cancellationToken))
                    return Error(422, "UNIT_INACTIVE", "The Unit assigned to the old Device is not active in this Site.");
                foreach (var deviceId in new[] { old.Value.Id, replacement.Value.Id })
                    if (await HasLaterActivityAsync(connection, transaction, deviceId, Guid.Empty, started, DateTime.UtcNow, cancellationToken))
                        return Error(409, "LATER_ACTIVITY_EXISTS", "Replacement time precedes an existing Device activity.");

                var localFinishDate = DateOnly.FromDateTime(finishedLocal);
                var duration = (int)(finished - started).TotalMinutes;
                var month = startedLocal.ToString("yyyyMM", CultureInfo.InvariantCulture);
                await using var sequence = new NpgsqlCommand("""
                    INSERT INTO form_sequences (activity_type, year_month, last_number) VALUES ('replacement', @month, 1)
                    ON CONFLICT (activity_type, year_month) DO UPDATE SET last_number = form_sequences.last_number + 1
                    RETURNING last_number
                    """, connection, transaction);
                sequence.Parameters.AddWithValue("month", month);
                var number = (int)(await sequence.ExecuteScalarAsync(cancellationToken))!;
                var formNumber = $"REP-{month}-{number:D3}";
                var activityId = Guid.NewGuid();
                var group = Guid.NewGuid();
                var requestId = context.Response.Headers["X-Request-Id"].ToString();
                await using var save = new NpgsqlCommand("""
                    INSERT INTO activities (activity_id, activity_type, form_number, site_id, unit_id, started_at, finished_at,
                        time_zone_id, start_utc_offset_minutes, finish_utc_offset_minutes, duration_minutes, shift,
                        technician_user_id, technician_name, technician_nrp, group_leader, remarks, created_by)
                    VALUES (@id, 'replacement', @form, @site, @unit, @started, @finished, @zone, @start_offset, @finish_offset,
                        @duration, @shift, @actor, @actor_name, @actor_nrp, @leader, @remarks, @actor);
                    INSERT INTO replacement_details (activity_id, old_final_status_id, source_power, spm_version,
                        ip_address, ip_cpe, ip_vhms)
                    VALUES (@id, @final_status, @power, @spm, @ip, @cpe, @vhms);
                    INSERT INTO activity_devices (activity_id, device_id, role, before_status_id, after_status_id, before_unit_id,
                        after_unit_id, before_location_site_id, after_location_site_id, before_last_maintenance_date, after_last_maintenance_date)
                    VALUES (@id, @old_device, 'old', @in_use, @final_status, @unit, NULL, @old_location, @old_location, @old_maintenance, @local_finish),
                           (@id, @new_device, 'new', @rfu, @in_use, NULL, @unit, @new_location, @site, @new_maintenance, @local_finish);
                    UPDATE devices SET status_id = @final_status, current_unit_id = NULL,
                        last_maintenance_date = @local_finish, updated_at = CURRENT_TIMESTAMP, updated_by = @actor WHERE device_id = @old_device;
                    UPDATE devices SET status_id = @in_use, current_unit_id = @unit, current_location_site_id = @site,
                        last_maintenance_date = @local_finish, updated_at = CURRENT_TIMESTAMP, updated_by = @actor WHERE device_id = @new_device;
                    INSERT INTO idempotency_keys (user_id, idempotency_key, activity_type, request_hash, activity_id, form_number)
                    VALUES (@actor, @key, 'replacement', @hash, @id, @form);
                    INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation,
                        new_values, change_group_id, request_id, action)
                    VALUES (@actor, @actor_name, @site, 'replacement', @form, @id, 'INSERT', @activity_audit, @group, @request_id, 'transaction_create');
                    INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation,
                        old_values, new_values, change_group_id, request_id, action)
                    VALUES (@actor, @actor_name, @site, 'device', @old_code, @old_device, 'UPDATE', @old_before, @old_after, @group, @request_id, 'transaction_create'),
                           (@actor, @actor_name, @site, 'device', @new_code, @new_device, 'UPDATE', @new_before, @new_after, @group, @request_id, 'transaction_create')
                    """, connection, transaction);
                save.Parameters.AddWithValue("id", activityId); save.Parameters.AddWithValue("form", formNumber); save.Parameters.AddWithValue("site", siteId);
                save.Parameters.AddWithValue("unit", old.Value.UnitId.Value); save.Parameters.AddWithValue("started", started); save.Parameters.AddWithValue("finished", finished);
                save.Parameters.AddWithValue("zone", siteData.Value.Zone); save.Parameters.AddWithValue("start_offset", (short)startOffset.TotalMinutes);
                save.Parameters.AddWithValue("finish_offset", (short)finishOffset.TotalMinutes); save.Parameters.AddWithValue("duration", duration);
                save.Parameters.AddWithValue("actor", user.UserId); save.Parameters.AddWithValue("actor_name", user.Name); save.Parameters.AddWithValue("actor_nrp", user.Nrp);
                save.Parameters.AddWithValue("shift", upload.Payload.Shift!.Trim()); save.Parameters.AddWithValue("leader", upload.Payload.GroupLeader!.Trim());
                save.Parameters.AddWithValue("remarks", upload.Payload.Remarks?.Trim() ?? ""); save.Parameters.AddWithValue("final_status", finalStatusId.Value);
                save.Parameters.AddWithValue("power", upload.Payload.SourcePower!.Trim()); save.Parameters.AddWithValue("spm", upload.Payload.SpmVersion!.Trim());
                save.Parameters.AddWithValue("old_device", old.Value.Id); save.Parameters.AddWithValue("new_device", replacement.Value.Id);
                save.Parameters.AddWithValue("in_use", old.Value.StatusId); save.Parameters.AddWithValue("rfu", replacement.Value.StatusId);
                save.Parameters.AddWithValue("local_finish", localFinishDate); save.Parameters.AddWithValue("old_code", old.Value.Code); save.Parameters.AddWithValue("new_code", replacement.Value.Code);
                save.Parameters.AddWithValue("key", key); save.Parameters.AddWithValue("hash", hash); save.Parameters.AddWithValue("group", group); save.Parameters.AddWithValue("request_id", requestId);
                AddNullable(save, "ip", NpgsqlDbType.Varchar, upload.Payload.IpAddress?.Trim());
                AddNullable(save, "cpe", NpgsqlDbType.Varchar, upload.Payload.IpCpe?.Trim()); AddNullable(save, "vhms", NpgsqlDbType.Varchar, upload.Payload.IpVhms?.Trim());
                AddNullable(save, "old_location", NpgsqlDbType.Integer, old.Value.LocationSiteId); AddNullable(save, "new_location", NpgsqlDbType.Integer, replacement.Value.LocationSiteId);
                AddNullable(save, "old_maintenance", NpgsqlDbType.Date, old.Value.LastMaintenanceDate); AddNullable(save, "new_maintenance", NpgsqlDbType.Date, replacement.Value.LastMaintenanceDate);
                save.Parameters.AddWithValue("activity_audit", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new { formNumber, siteId, oldDevice = old.Value.Code, newDevice = replacement.Value.Code, unitId = old.Value.UnitId, oldFinalStatus = upload.Payload.OldFinalStatus, durationMinutes = duration, photoSlots = upload.Photos.Select(photo => photo.Slot).ToArray() }));
                save.Parameters.AddWithValue("old_before", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new { status = "in_use", unitId = old.Value.UnitId }));
                save.Parameters.AddWithValue("old_after", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new { status = upload.Payload.OldFinalStatus, unitId = (Guid?)null, formNumber }));
                save.Parameters.AddWithValue("new_before", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new { status = "in_stock_rfu", unitId = (Guid?)null }));
                save.Parameters.AddWithValue("new_after", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new { status = "in_use", unitId = old.Value.UnitId, formNumber }));
                await save.ExecuteNonQueryAsync(cancellationToken);
                await SavePhotosAsync(app, connection, transaction, activityId, user.UserId, upload.Photos, createdFiles, cancellationToken);
                commitStarted = true;
                await transaction.CommitAsync(cancellationToken);
                return Results.Created($"/api/replacements/{formNumber}", new { activityId, formNumber });
            }
            catch (PostgresException error) when (error.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                app.Logger.LogWarning("Replacement conflict. SQL state {SqlState}, constraint {Constraint}, request {RequestId}.", error.SqlState, error.ConstraintName, context.Response.Headers["X-Request-Id"].ToString());
                return Error(409, "CONFLICT", "A concurrent operation conflicts with this Replacement.");
            }
            catch (PostgresException error)
            {
                app.Logger.LogError("Replacement database constraint failure. SQL state {SqlState}, constraint {Constraint}, request {RequestId}.", error.SqlState, error.ConstraintName, context.Response.Headers["X-Request-Id"].ToString());
                return Error(422, "DATABASE_CONSTRAINT", "Database rejected the Replacement data. Contact the administrator with the error code.");
            }
            catch (NpgsqlException) { return commitStarted ? Error(503, "COMMIT_OUTCOME_UNKNOWN", "Retry with the same Idempotency-Key.") : Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
            catch (IOException) { return Error(503, "PHOTO_STORAGE_UNAVAILABLE", "Photo storage unavailable."); }
            catch (UnauthorizedAccessException) { return Error(503, "PHOTO_STORAGE_UNAVAILABLE", "Photo storage unavailable."); }
            finally
            {
                if (!commitStarted)
                    foreach (var path in createdFiles)
                        try { File.Delete(path); } catch (IOException) { } catch (UnauthorizedAccessException) { }
            }
        });

        app.MapPatch("/api/replacements/{formNumber}", async (HttpContext context, string formNumber, CancellationToken cancellationToken) =>
        {
            if (!AuthEndpoints.HasAllowedOrigin(context)) return Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            ReplacementUploadRequest upload;
            try { upload = await ReplacementUploads.ReadAsync(context, cancellationToken); }
            catch (ReplacementUploadException error) { return Error(error.Status, error.Code, error.Message); }
            catch (BadHttpRequestException error) when (error.StatusCode == 413) { return Error(413, "REQUEST_TOO_LARGE", "The request is too large."); }
            if (upload.Payload.RowVersion is null || !TryVersion(upload.Payload.RowVersion, out var expectedVersion))
                return Error(400, "VALIDATION_FAILED", "rowVersion is required and must be valid.");
            if (!ValidateEditable(upload.Payload, out var validationMessage)) return Error(400, "VALIDATION_FAILED", validationMessage);

            var commitStarted = false;
            var createdFiles = new List<string>();
            var quarantine = new List<(Guid Id, string Path, string Extension)>();
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (user.Role != "superadmin") return Error(403, "SUPERADMIN_ONLY", "Only a Super Admin can edit this Replacement.");
                int siteId;
                long version;
                string form;
                await using (var head = new NpgsqlCommand("SELECT site_id, row_version, form_number FROM activities WHERE activity_type = 'replacement' AND form_number = @form FOR UPDATE", connection, transaction))
                {
                    head.Parameters.AddWithValue("form", formNumber);
                    await using var reader = await head.ExecuteReaderAsync(cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken)) return Error(404, "NOT_FOUND", "Replacement not found.");
                    siteId = reader.GetInt32(0); version = reader.GetInt64(1); form = reader.GetString(2);
                }
                if (!SessionStore.TryScope(user, siteId, out _)) return Error(403, "SITE_FORBIDDEN", "You cannot edit this Site.");
                if (version != expectedVersion) return Error(409, "STALE_VERSION", "The Replacement was changed. Reload and try again.");
                if (!await ImmutableFieldsMatchAsync(connection, transaction, form, upload.Payload, cancellationToken))
                    return Error(422, "HISTORY_FIELDS_IMMUTABLE", "This endpoint edits metadata and photos only; Site, times, Devices and final condition cannot be changed.");
                if (!await ValidLookupsAsync(connection, transaction, siteId, upload.Payload, cancellationToken))
                    return Error(422, "LOOKUP_NOT_FOUND", "A selected dropdown value is not active for this Site.");

                var existing = await ReadPhotosAsync(connection, transaction, formNumber, cancellationToken);
                var keep = new HashSet<string>(upload.Payload.KeepPhotoSlots ?? [], StringComparer.Ordinal);
                if (existing.Any(photo => photo.Slot == "camera_dashboard_angle" && upload.Photos.All(file => file.Slot != photo.Slot))) keep.Add("camera_dashboard_angle");
                if (upload.Photos.Count == 0 && keep.Count == 0 && existing.Count == 0)
                    return Error(422, "PHOTO_REQUIRED", "Replacement photos are required.");
                var retained = existing.Select(photo => photo.Slot).Where(keep.Contains).ToHashSet(StringComparer.Ordinal);
                var finalSlots = retained.Concat(upload.Photos.Select(photo => photo.Slot)).ToHashSet(StringComparer.Ordinal);
                if (ReplacementUploads.RequiredSlots.Any(slot => !finalSlots.Contains(slot)))
                    return Error(422, "PHOTO_REQUIRED", "All four required replacement photos must be present.");
                foreach (var photo in existing.Where(photo => !keep.Contains(photo.Slot) || upload.Photos.Any(file => file.Slot == photo.Slot)))
                    quarantine.Add((photo.Id, InstallationUploads.ResolvePath(InstallationUploads.StorageRoot(app), photo.Path), photo.Extension));

                var group = Guid.NewGuid();
                var before = new Dictionary<string, object?>();
                await using (var read = new NpgsqlCommand("SELECT a.shift, a.group_leader, a.remarks, r.source_power, r.spm_version, r.ip_address, r.ip_cpe, r.ip_vhms FROM activities a JOIN replacement_details r ON r.activity_id = a.activity_id WHERE a.form_number = @form", connection, transaction))
                {
                    read.Parameters.AddWithValue("form", form);
                    await using var reader = await read.ExecuteReaderAsync(cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken)) return Error(404, "NOT_FOUND", "Replacement not found.");
                    var names = new[] { "shift", "groupLeader", "remarks", "sourcePower", "spmVersion", "ipAddress", "ipCpe", "ipVhms" };
                    for (var index = 0; index < names.Length; index++) before[names[index]] = reader.IsDBNull(index) ? null : reader.GetString(index);
                }
                var after = new Dictionary<string, object?>
                {
                    ["shift"] = upload.Payload.Shift!.Trim(), ["groupLeader"] = upload.Payload.GroupLeader!.Trim(), ["remarks"] = upload.Payload.Remarks?.Trim() ?? "",
                    ["sourcePower"] = upload.Payload.SourcePower!.Trim(), ["spmVersion"] = upload.Payload.SpmVersion!.Trim(),
                    ["ipAddress"] = EmptyToNull(upload.Payload.IpAddress), ["ipCpe"] = EmptyToNull(upload.Payload.IpCpe), ["ipVhms"] = EmptyToNull(upload.Payload.IpVhms)
                };
                await using var update = new NpgsqlCommand("""
                    UPDATE activities SET shift = @shift, group_leader = @leader, remarks = @remarks,
                        updated_at = CURRENT_TIMESTAMP, updated_by = @actor WHERE form_number = @form RETURNING row_version;
                    UPDATE replacement_details SET source_power = @power, spm_version = @spm, ip_address = @ip, ip_cpe = @cpe, ip_vhms = @vhms
                    WHERE activity_id = (SELECT activity_id FROM activities WHERE form_number = @form)
                    """, connection, transaction);
                update.Parameters.AddWithValue("form", form); update.Parameters.AddWithValue("actor", user.UserId);
                update.Parameters.AddWithValue("shift", upload.Payload.Shift!.Trim()); update.Parameters.AddWithValue("leader", upload.Payload.GroupLeader!.Trim());
                update.Parameters.AddWithValue("remarks", upload.Payload.Remarks?.Trim() ?? ""); update.Parameters.AddWithValue("power", upload.Payload.SourcePower!.Trim());
                update.Parameters.AddWithValue("spm", upload.Payload.SpmVersion!.Trim());
                AddNullable(update, "ip", NpgsqlDbType.Varchar, EmptyToNull(upload.Payload.IpAddress));
                AddNullable(update, "cpe", NpgsqlDbType.Varchar, EmptyToNull(upload.Payload.IpCpe));
                AddNullable(update, "vhms", NpgsqlDbType.Varchar, EmptyToNull(upload.Payload.IpVhms));
                var newVersion = (long)(await update.ExecuteScalarAsync(cancellationToken))!;
                await SavePhotosAsync(app, connection, transaction, formNumber, user.UserId, existing, keep, upload.Photos, createdFiles, cancellationToken);
                foreach (var caption in upload.Payload.PhotoCaptions ?? [])
                {
                    if (!keep.Contains(caption.Key) || caption.Value is null || caption.Value.Length > 200)
                        return Error(400, "PHOTO_CAPTION_INVALID", "Captions must refer to preserved photos and contain at most 200 characters.");
                    await using var captionUpdate = new NpgsqlCommand("UPDATE transaction_photos SET caption = @caption WHERE activity_id = (SELECT activity_id FROM activities WHERE form_number = @form) AND slot_key = @slot", connection, transaction);
                    captionUpdate.Parameters.AddWithValue("caption", caption.Value.Trim()); captionUpdate.Parameters.AddWithValue("form", form);
                    captionUpdate.Parameters.AddWithValue("slot", caption.Key);
                    await captionUpdate.ExecuteNonQueryAsync(cancellationToken);
                }
                before["photos"] = existing.Select(photo => new { photo.Id, photo.Slot }).ToArray();
                after["photos"] = new { keptSlots = keep.ToArray(), newFiles = upload.Photos.Select(photo => new { photo.Slot, photo.Sha256, photo.Caption }).ToArray(), captions = upload.Payload.PhotoCaptions };
                await using (var audit = new NpgsqlCommand("""
                    INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation,
                        old_values, new_values, change_group_id, request_id, action)
                    VALUES (@actor, @name, @site, 'replacement', @form, (SELECT activity_id FROM activities WHERE form_number = @form),
                        'UPDATE', @before, @after, @group, @request, 'transaction_update')
                    """, connection, transaction))
                {
                    audit.Parameters.AddWithValue("actor", user.UserId); audit.Parameters.AddWithValue("name", user.Name); audit.Parameters.AddWithValue("site", siteId);
                    audit.Parameters.AddWithValue("form", form); audit.Parameters.AddWithValue("before", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(before));
                    audit.Parameters.AddWithValue("after", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(after)); audit.Parameters.AddWithValue("group", group);
                    audit.Parameters.AddWithValue("request", context.Response.Headers["X-Request-Id"].ToString());
                    await audit.ExecuteNonQueryAsync(cancellationToken);
                }
                commitStarted = true;
                await transaction.CommitAsync(cancellationToken);
                QuarantinePhotos(app, quarantine);
                return Results.Ok(new { formNumber = form, rowVersion = $"0x{newVersion:x16}" });
            }
            catch (NpgsqlException) { return commitStarted ? Error(503, "COMMIT_OUTCOME_UNKNOWN", "The outcome could not be confirmed. Reload before retrying.") : Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
            catch (IOException) { return Error(503, "PHOTO_STORAGE_UNAVAILABLE", "Photo storage unavailable."); }
            catch (UnauthorizedAccessException) { return Error(503, "PHOTO_STORAGE_UNAVAILABLE", "Photo storage unavailable."); }
            finally
            {
                if (!commitStarted)
                    foreach (var path in createdFiles)
                        try { File.Delete(path); } catch (IOException) { } catch (UnauthorizedAccessException) { }
            }
        });

        app.MapDelete("/api/replacements/{formNumber}", async (HttpContext context, string formNumber, CancellationToken cancellationToken) =>
        {
            if (!AuthEndpoints.HasAllowedOrigin(context)) return Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            var commitStarted = false;
            var photoPaths = new List<(Guid Id, string Path, string Extension)>();
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (user.Role != "superadmin") return Error(403, "SUPERADMIN_ONLY", "Only a Super Admin can delete this Replacement.");
                Guid activityId;
                int siteId;
                DateTime started, created, startedLocal;
                string zone;
                await using (var head = new NpgsqlCommand("SELECT activity_id, site_id, started_at, created_at, time_zone_id, (started_at AT TIME ZONE 'UTC') + make_interval(mins => start_utc_offset_minutes) FROM activities WHERE form_number = @form AND activity_type = 'replacement' FOR UPDATE", connection, transaction))
                {
                    head.Parameters.AddWithValue("form", formNumber);
                    await using var reader = await head.ExecuteReaderAsync(cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken)) return Error(404, "NOT_FOUND", "Replacement not found.");
                    activityId = reader.GetGuid(0); siteId = reader.GetInt32(1); started = reader.GetDateTime(2); created = reader.GetDateTime(3); zone = reader.GetString(4); startedLocal = reader.GetDateTime(5);
                }
                var snapshots = await ReadSnapshotsAsync(connection, transaction, activityId, cancellationToken);
                if (snapshots.Count != 2 || snapshots.All(snapshot => snapshot.Role != "old") || snapshots.All(snapshot => snapshot.Role != "new"))
                    return Error(500, "SNAPSHOT_INVALID", "Replacement device history is incomplete.");
                foreach (var snapshot in snapshots)
                {
                    if (!snapshot.MatchesCurrent) return Error(409, "DEVICE_STATE_CHANGED", "A Device state changed after this Replacement.");
                    if (await HasLaterActivityAsync(connection, transaction, snapshot.Id, activityId, started, created, cancellationToken))
                        return Error(409, "LATER_ACTIVITY_EXISTS", "A later activity exists for one of these Devices.");
                    if (snapshot.BeforeUnit is not null && await UnitOccupiedAsync(connection, transaction, snapshot.BeforeUnit.Value, snapshots.Select(item => item.Id).ToArray(), cancellationToken))
                        return Error(409, "UNIT_OCCUPIED", "A previous Unit is occupied by another Device.");
                }
                await using (var photos = new NpgsqlCommand("SELECT photo_id, storage_provider, storage_path, mime_type FROM transaction_photos WHERE activity_id = @id FOR UPDATE", connection, transaction))
                {
                    photos.Parameters.AddWithValue("id", activityId);
                    await using var reader = await photos.ExecuteReaderAsync(cancellationToken);
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        if (reader.GetString(1) != "local_fs") return Error(409, "PHOTO_DELETE_UNAVAILABLE", "Photo storage provider is not supported.");
                        var extension = reader.GetString(3) switch { "image/jpeg" => "jpg", "image/png" => "png", "image/webp" => "webp", _ => "" };
                        if (extension.Length == 0) return Error(409, "PHOTO_DELETE_UNAVAILABLE", "Photo type is not supported.");
                        photoPaths.Add((reader.GetGuid(0), InstallationUploads.ResolvePath(InstallationUploads.StorageRoot(app), reader.GetString(2)), extension));
                    }
                }
                var group = Guid.NewGuid();
                foreach (var snapshot in snapshots)
                {
                    await using var restore = new NpgsqlCommand("UPDATE devices SET status_id = @status, current_unit_id = @unit, current_location_site_id = @location, last_maintenance_date = @maintenance, updated_at = CURRENT_TIMESTAMP, updated_by = @actor WHERE device_id = @device", connection, transaction);
                    restore.Parameters.AddWithValue("status", snapshot.BeforeStatus); restore.Parameters.AddWithValue("actor", user.UserId); restore.Parameters.AddWithValue("device", snapshot.Id);
                    AddNullable(restore, "unit", NpgsqlDbType.Uuid, snapshot.BeforeUnit); AddNullable(restore, "location", NpgsqlDbType.Integer, snapshot.BeforeLocation);
                    AddNullable(restore, "maintenance", NpgsqlDbType.Date, snapshot.BeforeMaintenance);
                    await restore.ExecuteNonQueryAsync(cancellationToken);
                    await WriteDeleteAuditAndEventAsync(connection, transaction, context, user, siteId, activityId, formNumber, startedLocal, zone, group, snapshot, cancellationToken);
                }
                await using (var activityAudit = new NpgsqlCommand("""
                    INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation,
                        old_values, change_group_id, request_id, action)
                    VALUES (@actor, @name, @site, 'replacement', @form, @id, 'DELETE', @old, @group, @request, 'transaction_delete');
                    DELETE FROM activities WHERE activity_id = @id
                    """, connection, transaction))
                {
                    activityAudit.Parameters.AddWithValue("actor", user.UserId); activityAudit.Parameters.AddWithValue("name", user.Name);
                    activityAudit.Parameters.AddWithValue("site", siteId); activityAudit.Parameters.AddWithValue("form", formNumber);
                    activityAudit.Parameters.AddWithValue("id", activityId); activityAudit.Parameters.AddWithValue("old", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new { formNumber, activityType = "replacement", photos = photoPaths.Count }));
                    activityAudit.Parameters.AddWithValue("group", group); activityAudit.Parameters.AddWithValue("request", context.Response.Headers["X-Request-Id"].ToString());
                    await activityAudit.ExecuteNonQueryAsync(cancellationToken);
                }
                commitStarted = true;
                await transaction.CommitAsync(cancellationToken);
                QuarantinePhotos(app, photoPaths);
                return Results.Ok(new { deleted = true, formNumber });
            }
            catch (NpgsqlException) { return commitStarted ? Error(503, "COMMIT_OUTCOME_UNKNOWN", "Reload before retrying.") : Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
            catch (IOException) { return Error(503, "PHOTO_STORAGE_UNAVAILABLE", "Photo storage unavailable."); }
            catch (UnauthorizedAccessException) { return Error(503, "PHOTO_STORAGE_UNAVAILABLE", "Photo storage unavailable."); }
        });
    }

    private static bool Validate(ReplacementPayload input, out DateTime started, out DateTime finished, out string message)
    {
        started = default; finished = default; message = "The request is not valid.";
        if (input.SiteId is null or < 1 || !Text(input.OldDeviceCode, 40, true) || !Text(input.NewDeviceCode, 40, true) ||
            !Text(input.OldFinalStatus, 30, true) || input.OldFinalStatus is not ("in_stock_damaged" or "in_stock_ho" or "in_stock_rfu") ||
            !Text(input.Shift, 10, true) || !Text(input.GroupLeader, 120, true) || !Text(input.Remarks, 1000, false) ||
            !Text(input.SourcePower, 60, true) || !Text(input.SpmVersion, 60, true) || !ValidIp(input.IpAddress) || !ValidIp(input.IpCpe) || !ValidIp(input.IpVhms)) return false;
        if (!DateTime.TryParseExact(input.StartedAt, "yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out started) ||
            !DateTime.TryParseExact(input.FinishedAt, "yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out finished)) return false;
        if (finished < started || (finished - started).TotalMinutes > int.MaxValue) { message = "Finish time must not precede start time and duration must be valid."; return false; }
        return true;
    }

    private static bool ValidateEditable(ReplacementPayload input, out string message)
    {
        message = "The request is not valid.";
        if (!Text(input.Shift, 10, true) || input.Shift is not ("Shift 1" or "Shift 2") || !Text(input.GroupLeader, 120, true) ||
            !Text(input.Remarks, 1000, false) || !Text(input.SourcePower, 60, true) || !Text(input.SpmVersion, 60, true) ||
            !ValidIp(input.IpAddress) || !ValidIp(input.IpCpe) || !ValidIp(input.IpVhms)) return false;
        return true;
    }

    private static bool Text(string? value, int maxLength, bool required) => value is null ? !required : value.Trim().Length <= maxLength && (!required || value.Trim().Length > 0);
    private static bool ValidIp(string? value) => string.IsNullOrWhiteSpace(value) || (value.Trim().Length <= 45 && IPAddress.TryParse(value.Trim(), out _));
    private static string? EmptyToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool TryVersion(string text, out long version)
    {
        version = 0;
        return text.Length == 18 && text.StartsWith("0x", StringComparison.OrdinalIgnoreCase) &&
            long.TryParse(text.AsSpan(2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out version) && version > 0;
    }

    private static string RequestHash(int siteId, ReplacementUploadRequest upload)
    {
        var photos = upload.Photos.Select(photo => new { photo.Slot, photo.Sha256, photo.Caption }).ToArray();
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new { siteId, upload.Payload, photos });
        return Convert.ToHexStringLower(SHA256.HashData(bytes));
    }

    private static async Task<bool> ImmutableFieldsMatchAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string form, ReplacementPayload input, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("""
            SELECT EXISTS (
                SELECT 1 FROM activities a JOIN replacement_details r ON r.activity_id = a.activity_id
                JOIN device_statuses ds ON ds.status_id = r.old_final_status_id
                WHERE a.form_number = @form AND a.activity_type = 'replacement'
                  AND (@site IS NULL OR a.site_id = @site)
                  AND (@started IS NULL OR to_char((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes), 'YYYY-MM-DD"T"HH24:MI') = @started)
                  AND (@finished IS NULL OR to_char((a.finished_at AT TIME ZONE 'UTC') + make_interval(mins => a.finish_utc_offset_minutes), 'YYYY-MM-DD"T"HH24:MI') = @finished)
                  AND (@condition IS NULL OR ds.code = @condition)
                  AND (@old IS NULL OR EXISTS (SELECT 1 FROM activity_devices ad JOIN devices d ON d.device_id = ad.device_id WHERE ad.activity_id = a.activity_id AND ad.role = 'old' AND d.device_code = @old))
                  AND (@new IS NULL OR EXISTS (SELECT 1 FROM activity_devices ad JOIN devices d ON d.device_id = ad.device_id WHERE ad.activity_id = a.activity_id AND ad.role = 'new' AND d.device_code = @new))
            )
            """, connection, transaction);
        command.Parameters.AddWithValue("form", form);
        AddNullable(command, "site", NpgsqlDbType.Integer, input.SiteId);
        AddNullable(command, "started", NpgsqlDbType.Varchar, input.StartedAt); AddNullable(command, "finished", NpgsqlDbType.Varchar, input.FinishedAt);
        AddNullable(command, "condition", NpgsqlDbType.Varchar, input.OldFinalStatus);
        AddNullable(command, "old", NpgsqlDbType.Varchar, input.OldDeviceCode); AddNullable(command, "new", NpgsqlDbType.Varchar, input.NewDeviceCode);
        return (bool)(await command.ExecuteScalarAsync(ct))!;
    }

    private static async Task<(string Zone, bool Active)?> ReadSiteAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, int siteId, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("SELECT time_zone_id, is_active FROM sites WHERE site_id = @site", connection, transaction);
        command.Parameters.AddWithValue("site", siteId);
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? (reader.GetString(0), reader.GetBoolean(1)) : null;
    }

    private static bool TryResolveTimeZone(string zoneName, DateTime localStart, DateTime localFinish, out TimeZoneInfo zone,
        out DateTime started, out DateTime finished, out TimeSpan startOffset, out TimeSpan finishOffset, out string message)
    {
        zone = TimeZoneInfo.Utc; started = default; finished = default; startOffset = default; finishOffset = default; message = "The Site time zone is invalid.";
        try { zone = TimeZoneInfo.FindSystemTimeZoneById(zoneName); }
        catch (TimeZoneNotFoundException) { return false; }
        if (zone.IsInvalidTime(localStart) || zone.IsInvalidTime(localFinish) || zone.IsAmbiguousTime(localStart) || zone.IsAmbiguousTime(localFinish)) return false;
        startOffset = zone.GetUtcOffset(localStart); finishOffset = zone.GetUtcOffset(localFinish);
        started = new DateTimeOffset(localStart, startOffset).UtcDateTime; finished = new DateTimeOffset(localFinish, finishOffset).UtcDateTime;
        if (finished < started) { message = "Finish time must not precede start time."; return false; }
        if (finished > DateTime.UtcNow.AddMinutes(2)) { message = "Finish time cannot be in the future."; return false; }
        message = "";
        return true;
    }

    private static async Task<bool> ValidLookupsAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, int siteId, ReplacementPayload input, CancellationToken ct)
    {
        foreach (var (category, label) in new[] { ("shift", input.Shift), ("group_leader", input.GroupLeader), ("source_power", input.SourcePower), ("spm_version", input.SpmVersion) })
        {
            await using var command = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM lookup_values WHERE category = @category AND label = @label AND is_active AND (site_id IS NULL OR site_id = @site))", connection, transaction);
            command.Parameters.AddWithValue("category", category); command.Parameters.AddWithValue("label", label!.Trim()); command.Parameters.AddWithValue("site", siteId);
            if (!(bool)(await command.ExecuteScalarAsync(ct))!) return false;
        }
        return true;
    }

    private readonly record struct DeviceInfo(Guid Id, string Code, int SiteId, int StatusId, string StatusCode,
        Guid? UnitId, int? LocationSiteId, DateOnly? LastMaintenanceDate);

    private static async Task<DeviceInfo?> ReadDeviceAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string code, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("SELECT d.device_id, d.device_code, d.site_id, d.status_id, s.code, d.current_unit_id, d.current_location_site_id, d.last_maintenance_date FROM devices d JOIN device_statuses s ON s.status_id = d.status_id WHERE d.device_code = @code AND NOT d.is_deleted FOR UPDATE OF d", connection, transaction);
        command.Parameters.AddWithValue("code", code.Trim());
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? new DeviceInfo(reader.GetGuid(0), reader.GetString(1), reader.GetInt32(2), reader.GetInt32(3), reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetGuid(5), reader.IsDBNull(6) ? null : reader.GetInt32(6), reader.IsDBNull(7) ? null : reader.GetFieldValue<DateOnly>(7)) : null;
    }

    private static async Task<int?> FindStatusIdAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string code, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("SELECT status_id FROM device_statuses WHERE code = @code", connection, transaction);
        command.Parameters.AddWithValue("code", code);
        var result = await command.ExecuteScalarAsync(ct);
        return result is null ? null : (int)result;
    }

    private static async Task<bool> UnitIsActiveAtSiteAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid unitId, int siteId, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM fleet_units WHERE unit_id = @unit AND site_id = @site AND is_active)", connection, transaction);
        command.Parameters.AddWithValue("unit", unitId); command.Parameters.AddWithValue("site", siteId);
        return (bool)(await command.ExecuteScalarAsync(ct))!;
    }

    private static async Task SavePhotosAsync(WebApplication app, NpgsqlConnection connection, NpgsqlTransaction transaction,
        Guid activityId, Guid actor, IReadOnlyList<ReplacementUpload> photos, List<string> createdFiles, CancellationToken ct)
    {
        var receivedAt = DateTime.UtcNow;
        foreach (var photo in photos)
        {
            var photoId = Guid.NewGuid();
            var relativePath = $"photos/{receivedAt:yyyy}/{receivedAt:MM}/{photoId}.{photo.Extension}";
            var fullPath = InstallationUploads.ResolvePath(InstallationUploads.StorageRoot(app), relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
            await using (var file = new FileStream(fullPath, new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write, Share = FileShare.None, Options = FileOptions.Asynchronous }))
            {
                createdFiles.Add(fullPath);
                await file.WriteAsync(photo.Bytes, ct);
                await file.FlushAsync(ct);
            }
            await using var insert = new NpgsqlCommand("INSERT INTO transaction_photos (photo_id, activity_id, slot_key, caption, storage_provider, storage_path, original_filename, mime_type, size_bytes, sha256, uploaded_by, uploaded_at) VALUES (@photo, @activity, @slot, @caption, 'local_fs', @path, @filename, @mime, @size, @sha, @actor, @received)", connection, transaction);
            insert.Parameters.AddWithValue("photo", photoId); insert.Parameters.AddWithValue("activity", activityId); insert.Parameters.AddWithValue("slot", photo.Slot);
            insert.Parameters.AddWithValue("path", relativePath); insert.Parameters.AddWithValue("filename", photo.FileName); insert.Parameters.AddWithValue("mime", photo.MimeType);
            insert.Parameters.AddWithValue("size", (long)photo.Bytes.Length); insert.Parameters.AddWithValue("sha", photo.Sha256); insert.Parameters.AddWithValue("actor", actor);
            insert.Parameters.AddWithValue("received", receivedAt); AddNullable(insert, "caption", NpgsqlDbType.Varchar, photo.Caption);
            await insert.ExecuteNonQueryAsync(ct);
        }
    }

    private sealed record ExistingPhoto(Guid Id, string Slot, string Path, string Extension);

    private static async Task<List<ExistingPhoto>> ReadPhotosAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string formNumber, CancellationToken ct)
    {
        var result = new List<ExistingPhoto>();
        await using var command = new NpgsqlCommand("SELECT p.photo_id, p.slot_key, p.storage_path, p.mime_type FROM transaction_photos p JOIN activities a ON a.activity_id = p.activity_id WHERE a.form_number = @form AND a.activity_type = 'replacement' FOR UPDATE OF p", connection, transaction);
        command.Parameters.AddWithValue("form", formNumber);
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var extension = reader.GetString(3) switch { "image/jpeg" => "jpg", "image/png" => "png", "image/webp" => "webp", _ => "" };
            if (reader.GetString(2).Length == 0 || extension.Length == 0) throw new IOException("Unsupported photo storage record.");
            result.Add(new ExistingPhoto(reader.GetGuid(0), reader.GetString(1), reader.GetString(2), extension));
        }
        return result;
    }

    private static async Task SavePhotosAsync(WebApplication app, NpgsqlConnection connection, NpgsqlTransaction transaction, string form,
        Guid actor, List<ExistingPhoto> existing, HashSet<string> keep, IReadOnlyList<ReplacementUpload> uploads, List<string> createdFiles, CancellationToken ct)
    {
        await using (var remove = new NpgsqlCommand("DELETE FROM transaction_photos WHERE activity_id = (SELECT activity_id FROM activities WHERE form_number = @form) AND NOT (slot_key = ANY(@keep))", connection, transaction))
        {
            remove.Parameters.AddWithValue("form", form); remove.Parameters.AddWithValue("keep", keep.ToArray());
            await remove.ExecuteNonQueryAsync(ct);
        }
        await using (var removeReplaced = new NpgsqlCommand("DELETE FROM transaction_photos WHERE activity_id = (SELECT activity_id FROM activities WHERE form_number = @form) AND slot_key = ANY(@replaced)", connection, transaction))
        {
            removeReplaced.Parameters.AddWithValue("form", form); removeReplaced.Parameters.AddWithValue("replaced", uploads.Select(photo => photo.Slot).ToArray());
            await removeReplaced.ExecuteNonQueryAsync(ct);
        }
        var activityId = await ReadActivityIdAsync(connection, transaction, form, ct);
        await SavePhotosAsync(app, connection, transaction, activityId, actor, uploads, createdFiles, ct);
    }

    private static async Task<Guid> ReadActivityIdAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string form, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("SELECT activity_id FROM activities WHERE form_number = @form", connection, transaction);
        command.Parameters.AddWithValue("form", form);
        return (Guid)(await command.ExecuteScalarAsync(ct))!;
    }

    private static async Task<List<DeviceSnapshot>> ReadSnapshotsAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid activityId, CancellationToken ct)
    {
        var result = new List<DeviceSnapshot>();
        await using var command = new NpgsqlCommand("""
            SELECT d.device_id, d.device_code, d.site_id, ad.before_status_id, ad.after_status_id, ad.before_unit_id, ad.after_unit_id,
                ad.before_location_site_id, ad.after_location_site_id, ad.before_last_maintenance_date, ad.after_last_maintenance_date,
                ad.role, bs.code, afs.code,
                d.status_id = ad.after_status_id AND d.current_unit_id IS NOT DISTINCT FROM ad.after_unit_id
                    AND d.current_location_site_id IS NOT DISTINCT FROM ad.after_location_site_id
                    AND d.last_maintenance_date IS NOT DISTINCT FROM ad.after_last_maintenance_date AND NOT d.is_deleted AS state_matches
            FROM activity_devices ad JOIN devices d ON d.device_id = ad.device_id
            JOIN device_statuses bs ON bs.status_id = ad.before_status_id JOIN device_statuses afs ON afs.status_id = ad.after_status_id
            WHERE ad.activity_id = @id ORDER BY ad.role FOR UPDATE OF d
            """, connection, transaction);
        command.Parameters.AddWithValue("id", activityId);
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            result.Add(new DeviceSnapshot(reader.GetGuid(0), reader.GetString(1), reader.GetInt32(2), reader.GetInt32(3), reader.GetInt32(4),
                reader.IsDBNull(5) ? null : reader.GetGuid(5), reader.IsDBNull(6) ? null : reader.GetGuid(6),
                reader.IsDBNull(7) ? null : reader.GetInt32(7), reader.IsDBNull(8) ? null : reader.GetInt32(8),
                reader.IsDBNull(9) ? null : reader.GetFieldValue<DateOnly>(9), reader.IsDBNull(10) ? null : reader.GetFieldValue<DateOnly>(10),
                reader.GetString(11), reader.GetString(12), reader.GetString(13), reader.GetBoolean(14)));
        }
        return result;
    }

    private static async Task<bool> HasLaterActivityAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid deviceId, Guid activityId,
        DateTime started, DateTime created, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM activity_devices x JOIN activities a ON a.activity_id = x.activity_id WHERE x.device_id = @device AND a.activity_id <> @id AND (a.started_at > @started OR (a.started_at = @started AND a.created_at > @created)))", connection, transaction);
        command.Parameters.AddWithValue("device", deviceId); command.Parameters.AddWithValue("id", activityId); command.Parameters.AddWithValue("started", started); command.Parameters.AddWithValue("created", created);
        return (bool)(await command.ExecuteScalarAsync(ct))!;
    }

    private static async Task<bool> UnitOccupiedAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid unitId, Guid[] excludeDevices, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM devices WHERE current_unit_id = @unit AND NOT (device_id = ANY(@devices)))", connection, transaction);
        command.Parameters.AddWithValue("unit", unitId); command.Parameters.AddWithValue("devices", excludeDevices);
        return (bool)(await command.ExecuteScalarAsync(ct))!;
    }

    private static async Task WriteDeleteAuditAndEventAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, HttpContext context,
        SessionUser user, int activitySite, Guid activityId, string form, DateTime startedLocal, string zone, Guid group, DeviceSnapshot snapshot, CancellationToken ct)
    {
        var newUnit = snapshot.BeforeUnit;
        var oldValues = JsonSerializer.Serialize(new { status = snapshot.AfterCode, unitId = snapshot.AfterUnit });
        var newValues = JsonSerializer.Serialize(new { status = snapshot.BeforeCode, unitId = newUnit, deletedFormNumber = form });
        await using var command = new NpgsqlCommand("""
            WITH device_audit AS (
                INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation, old_values, new_values, change_group_id, request_id, action)
                VALUES (@actor, @name, @site, 'device', @code, @device, 'UPDATE', @old, @new, @group, @request, 'transaction_delete') RETURNING audit_id
            )
            INSERT INTO device_events (device_id, event_type, actor_user_id, actor_name, site_id, audit_id, source_activity_id, source_activity_type,
                source_form_number, source_role, source_started_at_local, source_time_zone_id)
            SELECT @device, 'transaction_deleted', @actor, @name, @site, audit_id, @activity, 'replacement', @form, @role, @started_local, @zone FROM device_audit
            """, connection, transaction);
        command.Parameters.AddWithValue("actor", user.UserId); command.Parameters.AddWithValue("name", user.Name); command.Parameters.AddWithValue("site", snapshot.SiteId);
        command.Parameters.AddWithValue("code", snapshot.Code); command.Parameters.AddWithValue("device", snapshot.Id); command.Parameters.AddWithValue("old", NpgsqlDbType.Jsonb, oldValues);
        command.Parameters.AddWithValue("new", NpgsqlDbType.Jsonb, newValues); command.Parameters.AddWithValue("group", group);
        command.Parameters.AddWithValue("request", context.Response.Headers["X-Request-Id"].ToString()); command.Parameters.AddWithValue("activity", activityId);
        command.Parameters.AddWithValue("form", form); command.Parameters.AddWithValue("role", snapshot.Role);
        command.Parameters.AddWithValue("started_local", DateTime.SpecifyKind(startedLocal, DateTimeKind.Unspecified)); command.Parameters.AddWithValue("zone", zone);
        await command.ExecuteNonQueryAsync(ct);
    }

    private static void QuarantinePhotos(WebApplication app, IEnumerable<(Guid Id, string Path, string Extension)> photos)
    {
        foreach (var photo in photos)
        {
            try
            {
                var quarantine = Path.Combine(InstallationUploads.StorageRoot(app), "_quarantine");
                Directory.CreateDirectory(quarantine);
                if (File.Exists(photo.Path)) File.Move(photo.Path, Path.Combine(quarantine, $"{photo.Id}.{photo.Extension}"), overwrite: false);
            }
            catch (IOException) { app.Logger.LogWarning("Unable to quarantine a deleted Replacement photo."); }
            catch (UnauthorizedAccessException) { app.Logger.LogWarning("Unable to quarantine a deleted Replacement photo."); }
        }
    }

    private static void AddNullable(NpgsqlCommand command, string name, NpgsqlDbType type, object? value) =>
        command.Parameters.Add(name, type).Value = value ?? DBNull.Value;

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}