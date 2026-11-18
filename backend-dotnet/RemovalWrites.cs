using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Npgsql;
using NpgsqlTypes;

public static class RemovalWrites
{
    private sealed record State(int Status, Guid? Unit, int? Location, DateOnly? Maintenance);
    private sealed record Device(Guid Id, string Code, int Site, bool Archived, State Current, bool UnitActive);
    private sealed record Head(Guid Id, int Site, long Version, DateTime Started, DateTime Finished, DateTime Created,
        string Zone, Guid DeviceId, State Before, State After, string Audit);
    private sealed record Photo(Guid Id, string Slot, string Path, string Mime, string? Caption);

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapPost("/api/removals", (HttpContext context, CancellationToken ct) => WriteAsync(app, getConnectionString, context, null, false, ct));
        app.MapPatch("/api/removals/{formNumber}", (HttpContext context, string formNumber, CancellationToken ct) => WriteAsync(app, getConnectionString, context, formNumber, false, ct));
        app.MapDelete("/api/removals/{formNumber}", (HttpContext context, string formNumber, CancellationToken ct) => WriteAsync(app, getConnectionString, context, formNumber, true, ct));
    }

    private static async Task<IResult> WriteAsync(WebApplication app, Func<string> getConnectionString, HttpContext context, string? formNumber, bool delete, CancellationToken ct)
    {
        if (!AuthEndpoints.HasAllowedOrigin(context)) return RemovalEndpoints.Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
        var token = context.Request.Cookies["mh02_session"];
        if (string.IsNullOrEmpty(token) || token.Length > 128) return RemovalEndpoints.Error(401, "UNAUTHENTICATED", "Authentication required.");
        var create = formNumber is null;
        var key = context.Request.Headers["Idempotency-Key"].ToString();
        if (create && !Regex.IsMatch(key, "^[A-Za-z0-9_-]{16,64}$")) return RemovalEndpoints.Error(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key must contain 16-64 letters, digits, underscores or hyphens.");
        var createdFiles = new List<string>();
        var retiredPhotos = new List<Photo>();
        var commitStarted = false;
        var requestId = context.Response.Headers["X-Request-Id"].ToString();
        try
        {
            await using var connection = new NpgsqlConnection(getConnectionString());
            await connection.OpenAsync(ct);
            await using var transaction = await connection.BeginTransactionAsync(ct);
            var user = await SessionStore.FindUserAsync(connection, token, ct);
            Require(user is not null, "UNAUTHENTICATED", "Authentication required.", 401);
            if (!create) Require(user!.Role == "superadmin", "SUPERADMIN_ONLY", "Only a Superadmin can update or delete a Removal.", 403);
            var upload = delete ? null : await RemovalUploads.ReadAsync(context, ct);
            var input = upload?.Input;
            if (input is not null) Validate(input);
            if (create)
            {
                Require(input!.RowVersion is null && (input.KeepPhotoSlots?.Length ?? 0) == 0, "VALIDATION_FAILED", "New removals cannot preserve photos or supply a rowVersion.", 400);
                Require(RemovalUploads.Slots.All(slot => upload!.Photos.Any(photo => photo.Slot == slot)), "PHOTO_REQUIRED", "Both removal photos are required.", 400);
            }
            Require(SessionStore.TryScope(user!, input?.SiteId, out var scopedSite), "SITE_FORBIDDEN", "You cannot access this Site.", 403);
            var hash = create ? Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new {
                upload!.Input, photos = upload.Photos.Select(photo => new { photo.Slot, photo.Caption, photo.Sha256 }).ToArray()
            }))) : "";
            if (create)
            {
                await using var barrier = new NpgsqlCommand("SELECT pg_advisory_xact_lock(hashtextextended(@key, 0))", connection, transaction) { CommandTimeout = 5 };
                barrier.Parameters.AddWithValue("key", $"idem:{user!.UserId}:{key}");
                await barrier.ExecuteNonQueryAsync(ct);
                await using var replay = new NpgsqlCommand("SELECT activity_type, request_hash, activity_id, form_number FROM idempotency_keys WHERE user_id = @actor AND idempotency_key = @key", connection, transaction);
                replay.Parameters.AddWithValue("actor", user.UserId); replay.Parameters.AddWithValue("key", key);
                await using var reader = await replay.ExecuteReaderAsync(ct);
                if (await reader.ReadAsync(ct))
                {
                    Require(reader.GetString(0) == "removal" && reader.GetString(1).Trim() == hash, "IDEMPOTENCY_KEY_REUSED", "This key was used for a different request.");
                    Require(!reader.IsDBNull(2) && !reader.IsDBNull(3), "IDEMPOTENCY_STATE_INVALID", "Stored idempotency state is invalid.", 500);
                    var previousId = reader.GetGuid(2); var previousNumber = reader.GetString(3);
                    await reader.DisposeAsync();
                    await using var exists = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM activities WHERE activity_id = @id AND activity_type = 'removal' AND site_id = @site)", connection, transaction);
                    exists.Parameters.AddWithValue("id", previousId); exists.Parameters.AddWithValue("site", input!.SiteId!.Value);
                    Require((bool)(await exists.ExecuteScalarAsync(ct))!, "ALREADY_PROCESSED_AND_DELETED", "The original Removal no longer exists.", 409);
                    context.Response.Headers["Idempotency-Replayed"] = "true";
                    return Results.Ok(new { activityId = previousId, formNumber = previousNumber });
                }
            }

            var head = create ? null : await ReadHeadAsync(connection, transaction, formNumber!, ct);
            Require(create || head is not null, "NOT_FOUND", "Removal not found.", 404);
            var siteId = create ? scopedSite!.Value : head!.Site;
            Require(scopedSite is null || scopedSite == siteId, "SITE_FORBIDDEN", "You cannot access this Site.", 403);
            var device = await ReadDeviceAsync(connection, transaction, input?.DeviceCode, head?.DeviceId, ct);
            Require(device is not null && device.Site == siteId, "DEVICE_NOT_FOUND", "Device not found in this Site.");
            Require(!device!.Archived, "DEVICE_ARCHIVED", "The Device is archived.", 409);
            if (head is not null)
            {
                Require(device.Id == head.DeviceId && (input?.SiteId is null || input.SiteId == head.Site), "HISTORY_FIELDS_IMMUTABLE", "The transaction Site and Device cannot be changed.");
                if (!delete)
                {
                    Require(input!.RowVersion is not null && Regex.IsMatch(input.RowVersion, "^0x[0-9a-fA-F]{16}$") &&
                        long.TryParse(input.RowVersion.AsSpan(2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out var version) && version == head.Version,
                        "STALE_VERSION", "The Removal changed. Reload before saving.", 409);
                }
            }

            if (delete)
            {
                Require(device.Current == head!.After, "DEVICE_STATE_CHANGED", "The Device no longer matches this transaction.", 409);
                await CheckLatestAsync(connection, transaction, device.Id, head.Id, head.Started, head.Created, ct);
                if (head.Before.Unit is Guid unitId)
                {
                    await using var occupied = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM devices WHERE current_unit_id = @unit AND device_id <> @device)", connection, transaction);
                    occupied.Parameters.AddWithValue("unit", unitId); occupied.Parameters.AddWithValue("device", device.Id);
                    Require(!(bool)(await occupied.ExecuteScalarAsync(ct))!, "UNIT_OCCUPIED", "The previous Unit is occupied.", 409);
                }
                retiredPhotos.AddRange(await ReadPhotosAsync(connection, transaction, head.Id, ct));
                await SetDeviceAsync(connection, transaction, device.Id, head.Before, user!.UserId, ct);
                var group = Guid.NewGuid();
                var auditId = await AuditAsync(connection, transaction, user, siteId, "device", device.Code, device.Id, "UPDATE", device.Current, head.Before, group, requestId, "transaction_delete", ct);
                await AuditAsync(connection, transaction, user, siteId, "removal", formNumber!, head.Id, "DELETE", JsonSerializer.Deserialize<JsonElement>(head.Audit), null, group, requestId, "transaction_delete", ct);
                await using var remove = new NpgsqlCommand("""
                    INSERT INTO device_events (device_id, event_type, actor_user_id, actor_name, site_id, audit_id,
                        source_activity_id, source_activity_type, source_form_number, source_role, source_started_at_local, source_time_zone_id)
                    SELECT @device, 'transaction_deleted', @actor, @name, @site, @audit, activity_id, 'removal', form_number, 'subject',
                        (started_at AT TIME ZONE 'UTC') + make_interval(mins => start_utc_offset_minutes), time_zone_id
                    FROM activities WHERE activity_id = @id;
                    DELETE FROM activities WHERE activity_id = @id
                    """, connection, transaction);
                remove.Parameters.AddWithValue("device", device.Id); remove.Parameters.AddWithValue("actor", user.UserId);
                remove.Parameters.AddWithValue("name", user.Name); remove.Parameters.AddWithValue("site", siteId);
                remove.Parameters.AddWithValue("audit", auditId); remove.Parameters.AddWithValue("id", head.Id);
                await remove.ExecuteNonQueryAsync(ct);
                commitStarted = true;
                await transaction.CommitAsync(ct);
                Quarantine(app, retiredPhotos);
                return Results.Ok(new { deleted = true, formNumber });
            }

            string zoneName;
            await using (var site = new NpgsqlCommand("SELECT time_zone_id FROM sites WHERE site_id = @site AND is_active", connection, transaction))
            {
                site.Parameters.AddWithValue("site", siteId);
                var result = await site.ExecuteScalarAsync(ct);
                Require(result is string, "SITE_INACTIVE", "The Site is missing or inactive.");
                zoneName = head?.Zone ?? (string)result!;
            }
            var times = ResolveTimes(input!, zoneName);
            await CheckLookupsAsync(connection, transaction, siteId, input!, ct);
            var finalStatus = input!.FinalCondition switch { "in_stock_rfu" => 2, "in_stock_damaged" => 3, "in_stock_ho" => 4, _ => 0 };
            var newState = new State(finalStatus, null, head is null ? device.Current.Location : head.Before.Location, DateOnly.FromDateTime(times.FinishLocal));
            var stateChanged = create || head!.After != newState || head.Started != times.Started || head.Finished != times.Finished;
            if (create)
            {
                Require(device.Current.Status == 1 && device.Current.Unit is not null && device.UnitActive, "DEVICE_NOT_IN_USE", "Select an In Use Device on an active Unit of this Site.");
                await CheckLatestAsync(connection, transaction, device.Id, Guid.Empty, times.Started, DateTime.UtcNow, ct);
            }
            else if (stateChanged)
            {
                Require(device.Current == head!.After, "DEVICE_STATE_CHANGED", "The Device no longer matches this Removal.", 409);
                await CheckLatestAsync(connection, transaction, device.Id, head.Id, head.Started, head.Created, ct);
                await CheckLatestAsync(connection, transaction, device.Id, head.Id, times.Started, DateTime.UtcNow, ct);
            }
            var id = head?.Id ?? Guid.NewGuid();
            var existingPhotos = create ? new List<Photo>() : await ReadPhotosAsync(connection, transaction, id, ct);
            var keep = input.KeepPhotoSlots ?? [];
            Require(keep.All(slot => existingPhotos.Any(photo => photo.Slot == slot)), "PHOTO_NOT_FOUND", "A preserved photo does not belong to this Removal.");
            Require(RemovalUploads.Slots.All(slot => keep.Contains(slot) || upload!.Photos.Any(photo => photo.Slot == slot)), "PHOTO_REQUIRED", "Both removal photo slots are required.");
            if (create)
            {
                var month = times.StartLocal.ToString("yyyyMM", CultureInfo.InvariantCulture);
                await using var sequence = new NpgsqlCommand("INSERT INTO form_sequences (activity_type, year_month, last_number) VALUES ('removal', @month, 1) ON CONFLICT (activity_type, year_month) DO UPDATE SET last_number = form_sequences.last_number + 1 RETURNING last_number", connection, transaction);
                sequence.Parameters.AddWithValue("month", month);
                var nextNumber = (int)(await sequence.ExecuteScalarAsync(ct))!;
                formNumber = $"REM-{month}-{nextNumber:D3}";
            }
            var groupId = Guid.NewGuid();
            var before = head?.Before ?? device.Current;
            await using (var save = new NpgsqlCommand(create ? """
                INSERT INTO activities (activity_id, activity_type, form_number, site_id, unit_id, started_at, finished_at, time_zone_id,
                    start_utc_offset_minutes, finish_utc_offset_minutes, duration_minutes, shift, technician_user_id, technician_name,
                    technician_nrp, group_leader, remarks, created_by)
                VALUES (@id, 'removal', @form, @site, @unit, @started, @finished, @zone, @start_offset, @finish_offset,
                    @duration, @shift, @actor, @name, @nrp, @leader, @remarks, @actor);
                INSERT INTO removal_details (activity_id, reason, reason_detail, final_status_id) VALUES (@id, @reason, @reason_detail, @status);
                INSERT INTO activity_devices (activity_id, device_id, role, before_status_id, after_status_id, before_unit_id, after_unit_id,
                    before_location_site_id, after_location_site_id, before_last_maintenance_date, after_last_maintenance_date)
                VALUES (@id, @device, 'subject', @before_status, @status, @unit, NULL, @location, @location, @before_maintenance, @maintenance)
                """ : """
                UPDATE activities SET started_at = @started, finished_at = @finished, start_utc_offset_minutes = @start_offset,
                    finish_utc_offset_minutes = @finish_offset, duration_minutes = @duration, shift = @shift, group_leader = @leader,
                    remarks = @remarks, updated_by = @actor, updated_at = CURRENT_TIMESTAMP WHERE activity_id = @id;
                UPDATE removal_details SET reason = @reason, reason_detail = @reason_detail, final_status_id = @status WHERE activity_id = @id;
                UPDATE activity_devices SET after_status_id = @status, after_last_maintenance_date = @maintenance WHERE activity_id = @id AND device_id = @device
                """, connection, transaction))
            {
                save.Parameters.AddWithValue("id", id); save.Parameters.AddWithValue("form", formNumber!); save.Parameters.AddWithValue("site", siteId);
                save.Parameters.AddWithValue("device", device.Id); save.Parameters.AddWithValue("actor", user!.UserId); save.Parameters.AddWithValue("name", user.Name); save.Parameters.AddWithValue("nrp", user.Nrp);
                save.Parameters.AddWithValue("started", times.Started); save.Parameters.AddWithValue("finished", times.Finished); save.Parameters.AddWithValue("zone", zoneName);
                save.Parameters.AddWithValue("start_offset", times.StartOffset); save.Parameters.AddWithValue("finish_offset", times.FinishOffset);
                save.Parameters.AddWithValue("duration", (int)(times.Finished - times.Started).TotalMinutes); save.Parameters.AddWithValue("shift", input.Shift!.Trim());
                save.Parameters.AddWithValue("leader", input.GroupLeader!.Trim()); save.Parameters.AddWithValue("remarks", input.Remarks?.Trim() ?? "");
                save.Parameters.AddWithValue("reason", input.Reason!.Trim()); save.Parameters.AddWithValue("reason_detail", input.ReasonDetail!.Trim());
                save.Parameters.AddWithValue("status", finalStatus); save.Parameters.AddWithValue("before_status", before.Status);
                save.Parameters.AddWithValue("maintenance", newState.Maintenance!.Value);
                Add(save, "unit", NpgsqlDbType.Uuid, before.Unit); Add(save, "location", NpgsqlDbType.Integer, before.Location);
                Add(save, "before_maintenance", NpgsqlDbType.Date, before.Maintenance);
                await save.ExecuteNonQueryAsync(ct);
            }
            if (stateChanged)
            {
                await SetDeviceAsync(connection, transaction, device.Id, newState, user!.UserId, ct);
                await AuditAsync(connection, transaction, user, siteId, "device", device.Code, device.Id, "UPDATE", device.Current, newState, groupId, requestId, create ? "transaction_create" : "transaction_update", ct);
            }
            retiredPhotos.AddRange(existingPhotos.Where(photo => !keep.Contains(photo.Slot)));
            await SavePhotosAsync(app, connection, transaction, id, user!.UserId, upload!, createdFiles, ct);
            await AuditAsync(connection, transaction, user, siteId, "removal", formNumber!, id, create ? "INSERT" : "UPDATE",
                head is null ? null : new { activity = JsonSerializer.Deserialize<JsonElement>(head.Audit), photos = existingPhotos.Select(photo => new { photo.Id, photo.Slot, photo.Caption }).ToArray() },
                new { input, photos = upload!.Photos.Select(photo => new { photo.Slot, photo.Sha256, photo.Caption }).ToArray() }, groupId, requestId, create ? "transaction_create" : "transaction_update", ct);
            if (create)
            {
                await using var idem = new NpgsqlCommand("INSERT INTO idempotency_keys (user_id, idempotency_key, activity_type, request_hash, activity_id, form_number) VALUES (@actor, @key, 'removal', @hash, @id, @form)", connection, transaction);
                idem.Parameters.AddWithValue("actor", user.UserId); idem.Parameters.AddWithValue("key", key); idem.Parameters.AddWithValue("hash", hash);
                idem.Parameters.AddWithValue("id", id); idem.Parameters.AddWithValue("form", formNumber!);
                await idem.ExecuteNonQueryAsync(ct);
            }
            await using var versionCommand = new NpgsqlCommand("SELECT row_version FROM activities WHERE activity_id = @id", connection, transaction);
            versionCommand.Parameters.AddWithValue("id", id);
            var newVersion = (long)(await versionCommand.ExecuteScalarAsync(ct))!;
            commitStarted = true;
            await transaction.CommitAsync(ct);
            Quarantine(app, retiredPhotos);
            return create ? Results.Created($"/api/removals/{formNumber}", new { activityId = id, formNumber, rowVersion = $"0x{newVersion:x16}" })
                : Results.Ok(new { activityId = id, formNumber, rowVersion = $"0x{newVersion:x16}" });
        }
        catch (InstallationUploadException error) { return RemovalEndpoints.Error(error.Status, error.Code, error.Message); }
        catch (BadHttpRequestException error) when (error.StatusCode == 413) { return RemovalEndpoints.Error(413, "REQUEST_TOO_LARGE", "The request is too large."); }
        catch (PostgresException error)
        {
            app.Logger.LogWarning("Removal database failure: SQL state {State}, constraint {Constraint}, request {RequestId}.", error.SqlState, error.ConstraintName, requestId);
            return RemovalEndpoints.Error(error.SqlState == PostgresErrorCodes.UniqueViolation ? 409 : 422, "DATABASE_CONFLICT", "Database rejected this operation. Reload and check the Device state.");
        }
        catch (NpgsqlException) { return RemovalEndpoints.Error(503, commitStarted ? "COMMIT_OUTCOME_UNKNOWN" : "DATABASE_UNAVAILABLE", commitStarted ? "Outcome unknown. Retry create with the same Idempotency-Key; reload before retrying update/delete." : "Database unavailable."); }
        catch (IOException) { return RemovalEndpoints.Error(503, "PHOTO_STORAGE_UNAVAILABLE", "Photo storage unavailable."); }
        catch (UnauthorizedAccessException) { return RemovalEndpoints.Error(503, "PHOTO_STORAGE_UNAVAILABLE", "Photo storage unavailable."); }
        finally
        {
            if (!commitStarted) foreach (var path in createdFiles)
                try { File.Delete(path); } catch (IOException) { app.Logger.LogWarning("Uncommitted removal photo cleanup failed."); } catch (UnauthorizedAccessException) { app.Logger.LogWarning("Uncommitted removal photo cleanup denied."); }
        }
    }

    private static void Validate(RemovalInput input)
    {
        Require(input.SiteId is > 0 && !string.IsNullOrWhiteSpace(input.DeviceCode) && input.DeviceCode.Length <= 40, "VALIDATION_FAILED", "Site and Device are required.", 400);
        Require(input.FinalCondition is "in_stock_rfu" or "in_stock_damaged" or "in_stock_ho", "VALIDATION_FAILED", "Invalid final condition.", 400);
        Require(input.Reason is "Kerusakan" or "Upgrade" or "Dismantle", "VALIDATION_FAILED", "Invalid removal reason.", 400);
        Require(!string.IsNullOrWhiteSpace(input.ReasonDetail) && input.ReasonDetail.Length <= 1000 && input.Shift is "Shift 1" or "Shift 2", "VALIDATION_FAILED", "Reason detail and a valid shift are required.", 400);
        Require(!string.IsNullOrWhiteSpace(input.GroupLeader) && input.GroupLeader.Length <= 120 && (input.Remarks?.Length ?? 0) <= 1000, "VALIDATION_FAILED", "Group Leader is required and text fields must respect their maximum length.", 400);
    }

    private sealed record Times(DateTime StartLocal, DateTime FinishLocal, DateTime Started, DateTime Finished, short StartOffset, short FinishOffset);
    private static Times ResolveTimes(RemovalInput input, string zoneName)
    {
        Require(DateTime.TryParseExact(input.StartedAt, "yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var start) &&
            DateTime.TryParseExact(input.FinishedAt, "yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _), "INVALID_DATETIME", "Use local Site time in yyyy-MM-ddTHH:mm format.", 400);
        var finish = DateTime.ParseExact(input.FinishedAt!, "yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture);
        Require(zoneName is "Asia/Jakarta" or "Asia/Pontianak" or "Asia/Makassar" or "Asia/Jayapura", "INVALID_TIME_ZONE", "Unsupported Site time zone.");
        TimeZoneInfo zone;
        try { zone = TimeZoneInfo.FindSystemTimeZoneById(zoneName); }
        catch (TimeZoneNotFoundException) { throw new InstallationUploadException("TIME_ZONE_UNAVAILABLE", "Site time zone unavailable.", 503); }
        catch (InvalidTimeZoneException) { throw new InstallationUploadException("TIME_ZONE_UNAVAILABLE", "Site time zone unavailable.", 503); }
        var started = new DateTimeOffset(start, zone.GetUtcOffset(start)).UtcDateTime;
        var finished = new DateTimeOffset(finish, zone.GetUtcOffset(finish)).UtcDateTime;
        Require(finished >= started && finished <= DateTime.UtcNow.AddMinutes(2) && (finished - started).TotalMinutes <= int.MaxValue, "INVALID_DATETIME", "Finish must not precede start or be in the future.");
        return new Times(start, finish, started, finished, (short)zone.GetUtcOffset(start).TotalMinutes, (short)zone.GetUtcOffset(finish).TotalMinutes);
    }

    private static async Task CheckLookupsAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, int siteId, RemovalInput input, CancellationToken ct)
    {
        foreach (var (category, label) in new[] { ("shift", input.Shift), ("group_leader", input.GroupLeader) })
        {
            await using var command = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM lookup_values WHERE category = @category AND label = @label AND is_active AND (site_id IS NULL OR site_id = @site))", connection, transaction);
            command.Parameters.AddWithValue("category", category); command.Parameters.AddWithValue("label", label!.Trim()); command.Parameters.AddWithValue("site", siteId);
            Require((bool)(await command.ExecuteScalarAsync(ct))!, "LOOKUP_NOT_FOUND", "A dropdown value is not active for this Site.");
        }
    }

    private static async Task<Device?> ReadDeviceAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string? code, Guid? id, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("""
            SELECT d.device_id, d.device_code, d.site_id, d.is_deleted, d.status_id, d.current_unit_id,
                d.current_location_site_id, d.last_maintenance_date, COALESCE(fu.is_active AND fu.site_id = d.site_id, false)
            FROM devices d LEFT JOIN fleet_units fu ON fu.unit_id = d.current_unit_id
            WHERE (@id IS NOT NULL AND d.device_id = @id) OR (@id IS NULL AND d.device_code = @code) FOR UPDATE OF d
            """, connection, transaction);
        Add(command, "id", NpgsqlDbType.Uuid, id); Add(command, "code", NpgsqlDbType.Varchar, code?.Trim());
        await using var reader = await command.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;
        var result = new Device(reader.GetGuid(0), reader.GetString(1), reader.GetInt32(2), reader.GetBoolean(3), ReadState(reader, 4), reader.GetBoolean(8));
        Require(code is null || result.Code == code.Trim(), "HISTORY_FIELDS_IMMUTABLE", "The transaction Device cannot be changed.");
        return result;
    }

    private static async Task<Head?> ReadHeadAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string form, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("""
            SELECT a.activity_id, a.site_id, a.row_version, a.started_at, a.finished_at, a.created_at, a.time_zone_id, ad.device_id,
                ad.before_status_id, ad.before_unit_id, ad.before_location_site_id, ad.before_last_maintenance_date,
                ad.after_status_id, ad.after_unit_id, ad.after_location_site_id, ad.after_last_maintenance_date,
                to_jsonb(a) || jsonb_build_object('details', to_jsonb(r), 'snapshot', to_jsonb(ad))
            FROM activities a JOIN removal_details r ON r.activity_id = a.activity_id
            JOIN activity_devices ad ON ad.activity_id = a.activity_id AND ad.role = 'subject'
            WHERE a.form_number = @form AND a.activity_type = 'removal' FOR UPDATE OF a, r, ad
            """, connection, transaction);
        command.Parameters.AddWithValue("form", form);
        await using var reader = await command.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;
        var result = new Head(reader.GetGuid(0), reader.GetInt32(1), reader.GetInt64(2), reader.GetDateTime(3), reader.GetDateTime(4), reader.GetDateTime(5),
            reader.GetString(6), reader.GetGuid(7), ReadState(reader, 8), ReadState(reader, 12), reader.GetString(16));
        Require(!await reader.ReadAsync(ct), "SNAPSHOT_INVALID", "Removal has multiple subject snapshots.", 500);
        return result;
    }

    private static State ReadState(NpgsqlDataReader reader, int ordinal) => new(reader.GetInt32(ordinal),
        reader.IsDBNull(ordinal + 1) ? null : reader.GetGuid(ordinal + 1), reader.IsDBNull(ordinal + 2) ? null : reader.GetInt32(ordinal + 2),
        reader.IsDBNull(ordinal + 3) ? null : reader.GetFieldValue<DateOnly>(ordinal + 3));

    private static async Task CheckLatestAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid deviceId, Guid exclude, DateTime start, DateTime created, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("""
            SELECT a.form_number, a.started_at, a.start_utc_offset_minutes, a.time_zone_id
            FROM activity_devices ad JOIN activities a ON a.activity_id = ad.activity_id
            WHERE ad.device_id = @device AND a.activity_id <> @exclude
              AND (a.started_at > @start OR (a.started_at = @start AND a.created_at > @created))
            ORDER BY a.started_at, a.created_at, a.activity_id LIMIT 1
            """, connection, transaction);
        command.Parameters.AddWithValue("device", deviceId); command.Parameters.AddWithValue("exclude", exclude);
        command.Parameters.AddWithValue("start", start); command.Parameters.AddWithValue("created", created);
        await using var reader = await command.ExecuteReaderAsync(ct);
        if (await reader.ReadAsync(ct))
        {
            var localStart = new DateTimeOffset(DateTime.SpecifyKind(reader.GetDateTime(1), DateTimeKind.Utc))
                .ToOffset(TimeSpan.FromMinutes(reader.GetInt16(2)))
                .ToString("yyyy-MM-dd HH:mm zzz", CultureInfo.InvariantCulture);
            throw new InstallationUploadException("LATER_ACTIVITY_EXISTS",
                $"Perangkat memiliki aktivitas yang lebih baru: {reader.GetString(0)} (mulai {localStart}, {reader.GetString(3)}). Transaksi harus mengikuti urutan riwayat perangkat.", 409);
        }
    }

    private static async Task SetDeviceAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid deviceId, State state, Guid actor, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("UPDATE devices SET status_id = @status, current_unit_id = @unit, current_location_site_id = @location, last_maintenance_date = @maintenance, updated_by = @actor, updated_at = CURRENT_TIMESTAMP WHERE device_id = @id", connection, transaction);
        command.Parameters.AddWithValue("status", state.Status); command.Parameters.AddWithValue("actor", actor); command.Parameters.AddWithValue("id", deviceId);
        Add(command, "unit", NpgsqlDbType.Uuid, state.Unit); Add(command, "location", NpgsqlDbType.Integer, state.Location); Add(command, "maintenance", NpgsqlDbType.Date, state.Maintenance);
        await command.ExecuteNonQueryAsync(ct);
    }

    private static async Task<long> AuditAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, SessionUser user, int site, string table, string record, Guid id,
        string operation, object? before, object? after, Guid group, string request, string action, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation, old_values, new_values, change_group_id, request_id, action) VALUES (@actor, @name, @site, @table, @record, @id, @operation, @before, @after, @group, @request, @action) RETURNING audit_id", connection, transaction);
        command.Parameters.AddWithValue("actor", user.UserId); command.Parameters.AddWithValue("name", user.Name); command.Parameters.AddWithValue("site", site);
        command.Parameters.AddWithValue("table", table); command.Parameters.AddWithValue("record", record); command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("operation", operation); command.Parameters.AddWithValue("group", group); command.Parameters.AddWithValue("request", request); command.Parameters.AddWithValue("action", action);
        Add(command, "before", NpgsqlDbType.Jsonb, before is null ? null : JsonSerializer.Serialize(before)); Add(command, "after", NpgsqlDbType.Jsonb, after is null ? null : JsonSerializer.Serialize(after));
        return (long)(await command.ExecuteScalarAsync(ct))!;
    }

    private static async Task<List<Photo>> ReadPhotosAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid id, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("SELECT photo_id, slot_key, storage_path, mime_type, caption, storage_provider FROM transaction_photos WHERE activity_id = @id FOR UPDATE", connection, transaction);
        command.Parameters.AddWithValue("id", id);
        var result = new List<Photo>();
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            Require(reader.GetString(5) == "local_fs" && reader.GetString(3) is "image/jpeg" or "image/png" or "image/webp", "PHOTO_STORAGE_UNAVAILABLE", "Unsupported photo storage.", 503);
            result.Add(new Photo(reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.IsDBNull(4) ? null : reader.GetString(4)));
        }
        return result;
    }

    private static async Task SavePhotosAsync(WebApplication app, NpgsqlConnection connection, NpgsqlTransaction transaction, Guid id, Guid actor,
        RemovalUploadRequest upload, List<string> created, CancellationToken ct)
    {
        await using (var remove = new NpgsqlCommand("DELETE FROM transaction_photos WHERE activity_id = @id AND NOT (slot_key = ANY(@keep))", connection, transaction))
        {
            remove.Parameters.AddWithValue("id", id); remove.Parameters.AddWithValue("keep", upload.Input.KeepPhotoSlots ?? []);
            await remove.ExecuteNonQueryAsync(ct);
        }
        foreach (var caption in upload.Input.PhotoCaptions ?? [])
        {
            await using var command = new NpgsqlCommand("UPDATE transaction_photos SET caption = @caption WHERE activity_id = @id AND slot_key = @slot", connection, transaction);
            command.Parameters.AddWithValue("caption", caption.Value.Trim()); command.Parameters.AddWithValue("id", id); command.Parameters.AddWithValue("slot", caption.Key);
            await command.ExecuteNonQueryAsync(ct);
        }
        foreach (var photo in upload.Photos)
        {
            var photoId = Guid.NewGuid(); var now = DateTime.UtcNow;
            var relative = $"photos/{now:yyyy}/{now:MM}/{photoId}.{photo.Extension}";
            var path = InstallationUploads.ResolvePath(InstallationUploads.StorageRoot(app), relative);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await using (var file = new FileStream(path, new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write, Share = FileShare.None, Options = FileOptions.Asynchronous }))
            {
                created.Add(path);
                await file.WriteAsync(photo.Bytes, ct); await file.FlushAsync(ct);
            }
            await using var insert = new NpgsqlCommand("INSERT INTO transaction_photos (photo_id, activity_id, slot_key, caption, storage_provider, storage_path, original_filename, mime_type, size_bytes, sha256, uploaded_by) VALUES (@photo, @id, @slot, @caption, 'local_fs', @path, @filename, @mime, @size, @sha, @actor)", connection, transaction);
            insert.Parameters.AddWithValue("photo", photoId); insert.Parameters.AddWithValue("id", id); insert.Parameters.AddWithValue("slot", photo.Slot);
            Add(insert, "caption", NpgsqlDbType.Varchar, photo.Caption); insert.Parameters.AddWithValue("path", relative); insert.Parameters.AddWithValue("filename", photo.FileName);
            insert.Parameters.AddWithValue("mime", photo.MimeType); insert.Parameters.AddWithValue("size", photo.Bytes.LongLength); insert.Parameters.AddWithValue("sha", photo.Sha256); insert.Parameters.AddWithValue("actor", actor);
            await insert.ExecuteNonQueryAsync(ct);
        }
    }

    private static void Quarantine(WebApplication app, IEnumerable<Photo> photos)
    {
        foreach (var photo in photos)
        {
            try
            {
                var path = InstallationUploads.ResolvePath(InstallationUploads.StorageRoot(app), photo.Path);
                var directory = Path.Combine(InstallationUploads.StorageRoot(app), "_quarantine");
                Directory.CreateDirectory(directory);
                var extension = photo.Mime switch { "image/png" => "png", "image/webp" => "webp", _ => "jpg" };
                if (File.Exists(path)) File.Move(path, Path.Combine(directory, $"{photo.Id}.{extension}"));
            }
            catch (IOException) { app.Logger.LogWarning("Removal photo quarantine failed for {PhotoId}.", photo.Id); }
            catch (UnauthorizedAccessException) { app.Logger.LogWarning("Removal photo quarantine denied for {PhotoId}.", photo.Id); }
        }
    }

    private static void Add(NpgsqlCommand command, string name, NpgsqlDbType type, object? value) => command.Parameters.Add(name, type).Value = value ?? DBNull.Value;
    private static void Require(bool condition, string code, string message, int status = 422)
    {
        if (!condition) throw new InstallationUploadException(code, message, status);
    }
}