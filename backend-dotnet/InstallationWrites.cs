using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Npgsql;
using NpgsqlTypes;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateInstallationRequest(
    string? StartedAt, string? FinishedAt, string? DeviceCode, string? UnitNo, int? SiteId,
    string? Shift, string? GroupLeader, string? Remarks, string? SourcePower, string? SpmVersion,
    string? Area, string? LocationDetail, string? IpAddress, string? IpCpe, string? IpVhms, string? Notes);

public static class InstallationWrites
{
    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapPost("/api/installations", async (HttpContext context, CancellationToken cancellationToken) =>
        {
            if (!AuthEndpoints.HasAllowedOrigin(context)) return Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            var key = context.Request.Headers["Idempotency-Key"].ToString();
            if (!Regex.IsMatch(key, "^[A-Za-z0-9_-]{16,64}$"))
                return Error(400, "IDEMPOTENCY_KEY_REQUIRED", "An Idempotency-Key of 16-64 characters is required.");
            InstallationUploadRequest request;
            try { request = await InstallationUploads.ReadAsync(context, cancellationToken); }
            catch (InstallationUploadException error) { return Error(error.Status, error.Code, error.Message); }
            catch (BadHttpRequestException error) when (error.StatusCode == 413) { return Error(413, "REQUEST_TOO_LARGE", "The request is too large."); }
            var input = request.Input;
            var validationError = Validate(input, out var startLocal, out var finishLocal);
            if (validationError is not null) return Error(400, "VALIDATION_FAILED", validationError);

            var commitStarted = false;
            var createdFiles = new List<string>();
            var requestId = context.Response.Headers["X-Request-Id"].ToString();
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, input.SiteId, out var scopedSite))
                    return Error(403, "SITE_FORBIDDEN", "You cannot write to this Site.");
                if (scopedSite is null) return Error(400, "SITE_REQUIRED", "siteId is required for a Super Admin.");
                var siteId = scopedSite.Value;
                var fingerprint = request.Photos.Select(photo => new { photo.Slot, photo.Sha256, photo.Caption }).ToArray();
                var hashBytes = request.Photos.Count == 0
                    ? JsonSerializer.SerializeToUtf8Bytes(new { siteId, input })
                    : JsonSerializer.SerializeToUtf8Bytes(new { siteId, input, photos = fingerprint });
                var hash = Convert.ToHexStringLower(SHA256.HashData(hashBytes));
                await using (var barrier = new NpgsqlCommand("SELECT pg_advisory_xact_lock(hashtextextended(@key, 0))", connection, transaction) { CommandTimeout = 5 })
                {
                    barrier.Parameters.AddWithValue("key", $"idem:{user.UserId}:{key}");
                    await barrier.ExecuteNonQueryAsync(cancellationToken);
                }
                await using (var previous = new NpgsqlCommand("""
                    SELECT activity_type, request_hash, activity_id, form_number
                    FROM idempotency_keys WHERE user_id = @user AND idempotency_key = @key
                    """, connection, transaction))
                {
                    previous.Parameters.AddWithValue("user", user.UserId);
                    previous.Parameters.AddWithValue("key", key);
                    await using var reader = await previous.ExecuteReaderAsync(cancellationToken);
                    if (await reader.ReadAsync(cancellationToken))
                    {
                        if (reader.GetString(0) != "installation" || reader.GetString(1).Trim() != hash)
                            return Error(422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request.");
                        if (reader.IsDBNull(2) || reader.IsDBNull(3))
                            return Error(500, "IDEMPOTENCY_STATE_CORRUPT", "The stored idempotency state is inconsistent.");
                        var previousId = reader.GetGuid(2);
                        var previousNumber = reader.GetString(3);
                        await reader.DisposeAsync();
                        await using var exists = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM activities WHERE activity_id = @id AND site_id = @site)", connection, transaction);
                        exists.Parameters.AddWithValue("id", previousId);
                        exists.Parameters.AddWithValue("site", siteId);
                        if (!(bool)(await exists.ExecuteScalarAsync(cancellationToken))!)
                            return Error(409, "ALREADY_PROCESSED_AND_DELETED", "The original result no longer exists.");
                        context.Response.Headers["Idempotency-Replayed"] = "true";
                        return Results.Ok(new { activityId = previousId, formNumber = previousNumber });
                    }
                }

                string zone;
                await using (var site = new NpgsqlCommand("SELECT time_zone_id, is_active FROM sites WHERE site_id = @site", connection, transaction))
                {
                    site.Parameters.AddWithValue("site", siteId);
                    await using var reader = await site.ExecuteReaderAsync(cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken) || !reader.GetBoolean(1)) return Error(422, "SITE_INACTIVE", "The Site does not exist or is inactive.");
                    zone = reader.GetString(0);
                }
                if (zone is not ("Asia/Jakarta" or "Asia/Pontianak" or "Asia/Makassar" or "Asia/Jayapura"))
                    return Error(422, "INVALID_TIME_ZONE", "The Site time zone is not supported.");
                TimeZoneInfo timeZone;
                try { timeZone = TimeZoneInfo.FindSystemTimeZoneById(zone); }
                catch (TimeZoneNotFoundException) { return Error(503, "TIME_ZONE_UNAVAILABLE", "The Site time zone is unavailable."); }
                if (timeZone.IsInvalidTime(startLocal) || timeZone.IsInvalidTime(finishLocal) || timeZone.IsAmbiguousTime(startLocal) || timeZone.IsAmbiguousTime(finishLocal))
                    return Error(422, "INVALID_DATETIME", "The local time cannot be resolved.");
                var startOffset = timeZone.GetUtcOffset(startLocal);
                var finishOffset = timeZone.GetUtcOffset(finishLocal);
                var started = new DateTimeOffset(startLocal, startOffset).UtcDateTime;
                var finished = new DateTimeOffset(finishLocal, finishOffset).UtcDateTime;
                if (finished < started) return Error(422, "FINISH_BEFORE_START", "finishedAt must not be before startedAt.");
                if (finished > DateTime.UtcNow.AddSeconds(120)) return Error(422, "FINISH_IN_FUTURE", "finishedAt cannot be in the future.");
                var minutes = (finished - started).TotalMinutes;
                if (minutes > int.MaxValue) return Error(422, "INVALID_DATETIME", "The duration is too long.");

                Guid unitId;
                int equipmentId;
                string? egi;
                await using (var unit = new NpgsqlCommand("""
                    SELECT unit_id, site_id, is_active, equipment_type_id, egi
                    FROM fleet_units WHERE unit_no = @no FOR UPDATE
                    """, connection, transaction))
                {
                    unit.Parameters.AddWithValue("no", input.UnitNo!.Trim());
                    await using var reader = await unit.ExecuteReaderAsync(cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken) || reader.GetInt32(1) != siteId)
                        return Error(422, "UNIT_NOT_FOUND", "The Unit does not exist in this Site.");
                    if (!reader.GetBoolean(2)) return Error(422, "UNIT_INACTIVE", "The Unit is inactive.");
                    unitId = reader.GetGuid(0); equipmentId = reader.GetInt32(3); egi = reader.IsDBNull(4) ? null : reader.GetString(4);
                }
                Guid deviceId;
                int? beforeLocation;
                DateOnly? beforeMaintenance;
                await using (var device = new NpgsqlCommand("""
                    SELECT device_id, site_id, status_id, is_deleted, current_location_site_id, last_maintenance_date
                    FROM devices WHERE device_code = @code FOR UPDATE
                    """, connection, transaction))
                {
                    device.Parameters.AddWithValue("code", input.DeviceCode!.Trim());
                    await using var reader = await device.ExecuteReaderAsync(cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken) || reader.GetInt32(1) != siteId)
                        return Error(422, "DEVICE_NOT_FOUND", "The Device does not exist in this Site.");
                    if (reader.GetBoolean(3) || reader.GetInt32(2) != 2)
                        return Error(422, "DEVICE_NOT_AVAILABLE", "The Device is not available for installation.");
                    deviceId = reader.GetGuid(0); beforeLocation = reader.IsDBNull(4) ? null : reader.GetInt32(4);
                    beforeMaintenance = reader.IsDBNull(5) ? null : reader.GetFieldValue<DateOnly>(5);
                }
                await using (var occupied = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM devices WHERE current_unit_id = @unit)", connection, transaction))
                {
                    occupied.Parameters.AddWithValue("unit", unitId);
                    if ((bool)(await occupied.ExecuteScalarAsync(cancellationToken))!) return Error(422, "UNIT_OCCUPIED", "The Unit already has a device installed.");
                }
                var yearMonth = startLocal.ToString("yyyyMM", CultureInfo.InvariantCulture);
                await using var sequence = new NpgsqlCommand("""
                    INSERT INTO form_sequences (activity_type, year_month, last_number) VALUES ('installation', @month, 1)
                    ON CONFLICT (activity_type, year_month) DO UPDATE SET last_number = form_sequences.last_number + 1
                    RETURNING last_number
                    """, connection, transaction);
                sequence.Parameters.AddWithValue("month", yearMonth);
                var number = (int)(await sequence.ExecuteScalarAsync(cancellationToken))!;
                var formNumber = $"INS-{yearMonth}-{number:D3}";
                var activityId = Guid.NewGuid();
                var group = Guid.NewGuid();
                var localFinishDate = DateOnly.FromDateTime(finishLocal);
                await using var save = new NpgsqlCommand("""
                    INSERT INTO activities (activity_id, activity_type, form_number, site_id, unit_id, started_at, finished_at,
                        time_zone_id, start_utc_offset_minutes, finish_utc_offset_minutes, duration_minutes, shift,
                        technician_user_id, technician_name, technician_nrp, group_leader, remarks, created_by)
                    VALUES (@id, 'installation', @form, @site, @unit, @started, @finished, @zone, @start_offset, @finish_offset,
                        @duration, @shift, @actor, @actor_name, @actor_nrp, @leader, @remarks, @actor);
                    INSERT INTO installation_details (activity_id, equipment_type_id, egi, source_power, spm_version, area,
                        location_detail, ip_address, ip_cpe, ip_vhms, notes)
                    VALUES (@id, @equipment, @egi, @power, @spm, @area, @location_detail, @ip, @cpe, @vhms, @notes);
                    INSERT INTO activity_devices (activity_id, device_id, role, before_status_id, after_status_id, before_unit_id,
                        after_unit_id, before_location_site_id, after_location_site_id, before_last_maintenance_date, after_last_maintenance_date)
                    VALUES (@id, @device, 'subject', 2, 1, NULL, @unit, @before_location, @site, @before_maintenance, @local_finish);
                    UPDATE devices SET status_id = 1, current_unit_id = @unit, current_location_site_id = @site,
                        last_maintenance_date = @local_finish, updated_at = CURRENT_TIMESTAMP, updated_by = @actor WHERE device_id = @device;
                    INSERT INTO idempotency_keys (user_id, idempotency_key, activity_type, request_hash, activity_id, form_number)
                    VALUES (@actor, @key, 'installation', @hash, @id, @form);
                    INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation,
                        new_values, change_group_id, request_id, action)
                    VALUES (@actor, @actor_name, @site, 'installation', @form, @id, 'INSERT', @activity_audit, @group, @request_id, 'transaction_create');
                    INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation,
                        old_values, new_values, change_group_id, request_id, action)
                    VALUES (@actor, @actor_name, @site, 'device', @device_code, @device, 'UPDATE', @device_before, @device_after,
                        @group, @request_id, 'transaction_create')
                    """, connection, transaction);
                save.Parameters.AddWithValue("id", activityId); save.Parameters.AddWithValue("form", formNumber);
                save.Parameters.AddWithValue("site", siteId); save.Parameters.AddWithValue("unit", unitId); save.Parameters.AddWithValue("device", deviceId);
                save.Parameters.AddWithValue("started", started); save.Parameters.AddWithValue("finished", finished); save.Parameters.AddWithValue("zone", zone);
                save.Parameters.AddWithValue("start_offset", (short)startOffset.TotalMinutes); save.Parameters.AddWithValue("finish_offset", (short)finishOffset.TotalMinutes);
                save.Parameters.AddWithValue("duration", (int)minutes); save.Parameters.AddWithValue("actor", user.UserId);
                save.Parameters.AddWithValue("actor_name", user.Name); save.Parameters.AddWithValue("actor_nrp", user.Nrp);
                save.Parameters.AddWithValue("equipment", equipmentId); save.Parameters.AddWithValue("local_finish", localFinishDate);
                save.Parameters.AddWithValue("key", key); save.Parameters.AddWithValue("hash", hash); save.Parameters.AddWithValue("group", group);
                save.Parameters.AddWithValue("request_id", context.Response.Headers["X-Request-Id"].ToString());
                save.Parameters.AddWithValue("device_code", input.DeviceCode.Trim());
                AddNullable(save, "before_location", NpgsqlDbType.Integer, beforeLocation); AddNullable(save, "before_maintenance", NpgsqlDbType.Date, beforeMaintenance);
                AddNullable(save, "shift", NpgsqlDbType.Varchar, input.Shift); AddNullable(save, "leader", NpgsqlDbType.Varchar, input.GroupLeader);
                AddNullable(save, "remarks", NpgsqlDbType.Varchar, input.Remarks); AddNullable(save, "egi", NpgsqlDbType.Varchar, egi);
                AddNullable(save, "power", NpgsqlDbType.Varchar, input.SourcePower); AddNullable(save, "spm", NpgsqlDbType.Varchar, input.SpmVersion);
                AddNullable(save, "area", NpgsqlDbType.Varchar, input.Area); AddNullable(save, "location_detail", NpgsqlDbType.Varchar, input.LocationDetail);
                AddNullable(save, "ip", NpgsqlDbType.Varchar, input.IpAddress); AddNullable(save, "cpe", NpgsqlDbType.Varchar, input.IpCpe);
                AddNullable(save, "vhms", NpgsqlDbType.Varchar, input.IpVhms); AddNullable(save, "notes", NpgsqlDbType.Varchar, input.Notes);
                save.Parameters.AddWithValue("activity_audit", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new { formNumber, siteId, unitNo = input.UnitNo.Trim(), deviceCode = input.DeviceCode.Trim(), startedAt = input.StartedAt, finishedAt = input.FinishedAt, durationMinutes = (int)minutes, photoSlots = request.Photos.Select(photo => photo.Slot).ToArray() }));
                save.Parameters.AddWithValue("device_before", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new { status = "in_stock_rfu", unitId = (Guid?)null }));
                save.Parameters.AddWithValue("device_after", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new { status = "in_use", unitId, formNumber }));
                await save.ExecuteNonQueryAsync(cancellationToken);

                var receivedAt = DateTime.UtcNow;
                foreach (var photo in request.Photos)
                {
                    var photoId = Guid.NewGuid();
                    var relativePath = $"photos/{receivedAt:yyyy}/{receivedAt:MM}/{photoId}.{photo.Extension}";
                    var fullPath = InstallationUploads.ResolvePath(InstallationUploads.StorageRoot(app), relativePath);
                    Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
                    await using (var file = new FileStream(fullPath, new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write, Share = FileShare.None, Options = FileOptions.Asynchronous }))
                    {
                        createdFiles.Add(fullPath);
                        await file.WriteAsync(photo.Bytes, cancellationToken);
                        await file.FlushAsync(cancellationToken);
                    }
                    await using var insertPhoto = new NpgsqlCommand("""
                        INSERT INTO transaction_photos (photo_id, activity_id, slot_key, caption, storage_provider, storage_path,
                            original_filename, mime_type, size_bytes, sha256, uploaded_by, uploaded_at)
                        VALUES (@photo, @activity, @slot, @caption, 'local_fs', @path, @filename, @mime, @size, @sha, @actor, @received)
                        """, connection, transaction);
                    insertPhoto.Parameters.AddWithValue("photo", photoId); insertPhoto.Parameters.AddWithValue("activity", activityId);
                    insertPhoto.Parameters.AddWithValue("slot", photo.Slot); insertPhoto.Parameters.AddWithValue("path", relativePath);
                    insertPhoto.Parameters.AddWithValue("filename", photo.FileName); insertPhoto.Parameters.AddWithValue("mime", photo.MimeType);
                    insertPhoto.Parameters.AddWithValue("size", (long)photo.Bytes.Length); insertPhoto.Parameters.AddWithValue("sha", photo.Sha256);
                    insertPhoto.Parameters.AddWithValue("actor", user.UserId); insertPhoto.Parameters.AddWithValue("received", receivedAt);
                    AddNullable(insertPhoto, "caption", NpgsqlDbType.Varchar, photo.Caption);
                    await insertPhoto.ExecuteNonQueryAsync(cancellationToken);
                }
                commitStarted = true;
                await transaction.CommitAsync(cancellationToken);
                return Results.Created($"/api/installations/{activityId}", new { activityId, formNumber });
            }
            catch (PostgresException error) when (error.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                app.Logger.LogWarning("Installation conflict. SQL state {SqlState}, constraint {Constraint}, request {RequestId}.", error.SqlState, error.ConstraintName, requestId);
                return Error(409, "CONFLICT", "A concurrent operation conflicts with this installation.");
            }
            catch (PostgresException error)
            {
                app.Logger.LogError("Installation database constraint failure. SQL state {SqlState}, constraint {Constraint}, request {RequestId}.", error.SqlState, error.ConstraintName, requestId);
                return Error(422, "DATABASE_CONSTRAINT", "Database rejected the installation data. Contact the administrator with the error code.");
            }
            catch (NpgsqlException error)
            {
                app.Logger.LogError("Installation database failure {ErrorType}, request {RequestId}.", error.GetType().Name, requestId);
                return commitStarted
                    ? Error(503, "COMMIT_OUTCOME_UNKNOWN", "The outcome could not be confirmed. Retry with the same Idempotency-Key.")
                    : Error(503, "DATABASE_UNAVAILABLE", "Database unavailable.");
            }
            catch (IOException) { app.Logger.LogError("Installation photo storage failure, request {RequestId}.", requestId); return Error(503, "PHOTO_STORAGE_UNAVAILABLE", "Photo storage unavailable."); }
            catch (UnauthorizedAccessException) { app.Logger.LogError("Installation photo storage access failure, request {RequestId}.", requestId); return Error(503, "PHOTO_STORAGE_UNAVAILABLE", "Photo storage unavailable."); }
            catch (Exception error)
            {
                app.Logger.LogError("Installation failed with {ErrorType}, request {RequestId}.", error.GetType().Name, requestId);
                return Error(500, "INTERNAL_ERROR", "Installation could not be saved. Share the request ID with support.");
            }
            finally
            {
                if (!commitStarted)
                    foreach (var path in createdFiles)
                        try { File.Delete(path); } catch (IOException) { app.Logger.LogWarning("Unable to remove an uncommitted photo file."); } catch (UnauthorizedAccessException) { app.Logger.LogWarning("Unable to remove an uncommitted photo file."); }
            }
        });
    }

    private static string? Validate(CreateInstallationRequest input, out DateTime started, out DateTime finished)
    {
        started = default; finished = default;
        if (!Text(input.DeviceCode, 40, true) || !Text(input.UnitNo, 30, true)) return "DeviceCode and UnitNo are required.";
        if (input.SiteId is not null && input.SiteId < 1) return "siteId must be positive.";
        if (input.Shift is not (null or "Shift 1" or "Shift 2")) return "Shift is not valid.";
        if (!Text(input.GroupLeader, 120) || !Text(input.Remarks, 1000) || !Text(input.SourcePower, 60) ||
            !Text(input.SpmVersion, 60) || !Text(input.Area, 60) || !Text(input.LocationDetail, 200) || !Text(input.Notes, 1000))
            return "One or more text fields exceed their maximum length.";
        if (!Ip(input.IpAddress) || !Ip(input.IpCpe) || !Ip(input.IpVhms)) return "One or more IP address fields are invalid.";
        if (!DateTime.TryParseExact(input.StartedAt, "yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out started) ||
            !DateTime.TryParseExact(input.FinishedAt, "yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out finished))
            return "Start and finish must use the local date-time format yyyy-MM-ddTHH:mm.";
        return null;
    }

    private static bool Text(string? value, int max, bool required = false) =>
        value is null ? !required : value.Trim().Length <= max && (!required || value.Trim().Length > 0);

    private static bool Ip(string? value) => string.IsNullOrEmpty(value) || (value.Length <= 45 && IPAddress.TryParse(value, out _));

    private static void AddNullable(NpgsqlCommand command, string name, NpgsqlDbType type, object? value) =>
        command.Parameters.Add(name, type).Value = value is string text ? text.Trim() : value ?? DBNull.Value;

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}