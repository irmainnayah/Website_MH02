using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Npgsql;
using NpgsqlTypes;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateDeviceRequest(int? SiteId, string? DeviceCode, string? SerialNumber, string? Notes, string? HealthCheckStatus);

// Notes: null = unchanged, "" = clear. A status, Unit, Site or location is NOT accepted (strict binding rejects it).
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record UpdateDeviceRequest(string? RowVersion, string? DeviceCode, string? SerialNumber, string? Notes, string? HealthCheckStatus);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ArchiveDeviceRequest(string? RowVersion, string? Reason);

/// <summary>
/// Device registration (every authenticated user, own Site), edit and archive (Super Admin only). Design 3.8, 6, 7:
/// a device always starts In Stock RFU, there is no hard delete and no Site transfer, "delete" is the Device Archive
/// (history kept), and every write has its audit row and device event in the same database transaction.
/// </summary>
public static class DeviceWrites
{
    private static readonly string[] Health = ["complete", "incomplete", "not_checked"];

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapPost("/api/devices", (HttpContext context, CreateDeviceRequest input, CancellationToken ct) => CreateAsync(app, getConnectionString, context, input, ct));
        app.MapPatch("/api/devices/{id:guid}", (HttpContext context, Guid id, UpdateDeviceRequest input, CancellationToken ct) => UpdateAsync(app, getConnectionString, context, id, input, ct));
        app.MapPost("/api/devices/{id:guid}/archive", (HttpContext context, Guid id, ArchiveDeviceRequest input, CancellationToken ct) => ArchiveAsync(app, getConnectionString, context, id, input, ct));
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool ParseRowVersion(string? text, out long value)
    {
        value = 0;
        return text is not null && Regex.IsMatch(text, "^0x[0-9a-fA-F]{16}$") && long.TryParse(text.AsSpan(2), System.Globalization.NumberStyles.HexNumber, null, out value);
    }

    private static async Task<object?> FetchAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, Guid id, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand($"{DeviceEndpoints.DeviceColumns} {DeviceEndpoints.DeviceJoins} WHERE d.device_id = @id", connection, transaction);
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? DeviceEndpoints.ToDevice(reader) : null;
    }

    /// <summary>Audit row + matching device event, in the caller's transaction. The event references the audit row.</summary>
    private static async Task WriteHistoryAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, SessionUser actor, int siteId,
        Guid deviceId, string code, string operation, string action, string eventType, string summary, string? reason,
        object? oldValues, object newValues, string requestId, CancellationToken ct)
    {
        await using var audit = new NpgsqlCommand("""
            INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation,
                old_values, new_values, change_group_id, request_id, action, reason)
            VALUES (@actor, @actor_name, @site, 'device', @code, @device, @operation, @old, @new, @group, @request, @action, @reason)
            RETURNING audit_id
            """, connection, transaction);
        audit.Parameters.AddWithValue("actor", actor.UserId);
        audit.Parameters.AddWithValue("actor_name", actor.Name);
        audit.Parameters.AddWithValue("site", siteId);
        audit.Parameters.AddWithValue("code", code);
        audit.Parameters.AddWithValue("device", deviceId);
        audit.Parameters.AddWithValue("operation", operation);
        audit.Parameters.Add("old", NpgsqlDbType.Jsonb).Value = oldValues is null ? DBNull.Value : JsonSerializer.Serialize(oldValues);
        audit.Parameters.AddWithValue("new", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(newValues));
        audit.Parameters.AddWithValue("group", Guid.NewGuid());
        audit.Parameters.AddWithValue("request", requestId);
        audit.Parameters.AddWithValue("action", action);
        audit.Parameters.Add("reason", NpgsqlDbType.Varchar).Value = (object?)reason ?? DBNull.Value;
        var auditId = (long)(await audit.ExecuteScalarAsync(ct))!;
        await using var evt = new NpgsqlCommand("""
            INSERT INTO device_events (device_id, event_type, actor_user_id, actor_name, site_id, audit_id, summary, reason)
            VALUES (@device, @type, @actor, @actor_name, @site, @audit, @summary, @reason)
            """, connection, transaction);
        evt.Parameters.AddWithValue("device", deviceId);
        evt.Parameters.AddWithValue("type", eventType);
        evt.Parameters.AddWithValue("actor", actor.UserId);
        evt.Parameters.AddWithValue("actor_name", actor.Name);
        evt.Parameters.AddWithValue("site", siteId);
        evt.Parameters.AddWithValue("audit", auditId);
        evt.Parameters.AddWithValue("summary", summary.Length > 200 ? summary[..200] : summary);
        evt.Parameters.Add("reason", NpgsqlDbType.Varchar).Value = (object?)reason ?? DBNull.Value;
        await evt.ExecuteNonQueryAsync(ct);
    }

    private static IResult Duplicate(PostgresException error) => error.ConstraintName switch
    {
        "devices_device_code_key" => Error(409, "DEVICE_CODE_EXISTS", "A device with this code already exists."),
        "ux_devices_serial_number" => Error(409, "SERIAL_EXISTS", "A device with this serial number already exists."),
        _ => Error(409, "CONFLICT", "A concurrent operation conflicts with this device."),
    };

    /* ----------------------------------------------------------------- create */

    private static async Task<IResult> CreateAsync(WebApplication app, Func<string> getConnectionString, HttpContext context, CreateDeviceRequest input, CancellationToken ct)
    {
        if (!AuthEndpoints.HasAllowedOrigin(context)) return Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
        var token = context.Request.Cookies["mh02_session"];
        if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
        var key = context.Request.Headers["Idempotency-Key"].ToString();
        if (!Regex.IsMatch(key, "^[A-Za-z0-9_-]{16,64}$"))
            return Error(400, "IDEMPOTENCY_KEY_REQUIRED", "An Idempotency-Key of 16-64 characters is required.");
        var code = input.DeviceCode?.Trim() ?? "";
        var serial = input.SerialNumber?.Trim() ?? "";
        var notes = Clean(input.Notes);
        var health = input.HealthCheckStatus ?? "not_checked";
        if (!Regex.IsMatch(code, "^[A-Za-z0-9._-]{1,40}$") || serial.Length is 0 or > 80 || (notes?.Length ?? 0) > 500 ||
            !Health.Contains(health) || (input.SiteId is not null && input.SiteId < 1))
            return Error(400, "VALIDATION_FAILED", "The request is not valid.");

        var requestId = context.Response.Headers["X-Request-Id"].ToString();
        var commitStarted = false;
        try
        {
            await using var connection = new NpgsqlConnection(getConnectionString());
            await connection.OpenAsync(ct);
            await using var transaction = await connection.BeginTransactionAsync(ct);
            var user = await SessionStore.FindUserAsync(connection, token, ct);
            if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (!SessionStore.TryScope(user, input.SiteId, out var scoped)) return Error(403, "SITE_FORBIDDEN", "You cannot write to this Site.");
            if (scoped is null) return Error(400, "SITE_REQUIRED", "siteId is required for a Super Admin.");
            var siteId = scoped.Value;
            var hash = Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new { siteId, code, serial, notes, health })));

            await using (var barrier = new NpgsqlCommand("SELECT pg_advisory_xact_lock(hashtextextended(@key, 0))", connection, transaction) { CommandTimeout = 5 })
            {
                barrier.Parameters.AddWithValue("key", $"idem:{user.UserId}:{key}");
                await barrier.ExecuteNonQueryAsync(ct);
            }
            await using (var previous = new NpgsqlCommand("SELECT activity_type, request_hash, device_id FROM idempotency_keys WHERE user_id = @user AND idempotency_key = @key", connection, transaction))
            {
                previous.Parameters.AddWithValue("user", user.UserId);
                previous.Parameters.AddWithValue("key", key);
                Guid? previousId = null;
                await using (var reader = await previous.ExecuteReaderAsync(ct))
                {
                    if (await reader.ReadAsync(ct))
                    {
                        if (reader.GetString(0) != "device" || reader.GetString(1).Trim() != hash)
                            return Error(422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request.");
                        if (reader.IsDBNull(2)) return Error(500, "IDEMPOTENCY_STATE_CORRUPT", "The stored idempotency state is inconsistent.");
                        previousId = reader.GetGuid(2);
                    }
                }
                if (previousId is not null)
                {
                    var replay = await FetchAsync(connection, transaction, previousId.Value, ct);
                    await using var visible = new NpgsqlCommand("SELECT NOT is_deleted OR @admin FROM devices WHERE device_id = @id AND site_id = @site", connection, transaction);
                    visible.Parameters.AddWithValue("id", previousId.Value);
                    visible.Parameters.AddWithValue("site", siteId);
                    visible.Parameters.AddWithValue("admin", user.Role == "superadmin");
                    if (replay is null || await visible.ExecuteScalarAsync(ct) is not true)
                        return Error(409, "ALREADY_PROCESSED_AND_ARCHIVED", "The original device is no longer visible.");
                    context.Response.Headers["Idempotency-Replayed"] = "true";
                    return Results.Ok(replay);
                }
            }

            await using (var site = new NpgsqlCommand("SELECT is_active FROM sites WHERE site_id = @site", connection, transaction))
            {
                site.Parameters.AddWithValue("site", siteId);
                if (await site.ExecuteScalarAsync(ct) is not true) return Error(422, "SITE_INACTIVE", "The Site does not exist or is inactive.");
            }
            // data_source 'manual' = registered by a person through the application. Always In Stock RFU (status 2), no Unit.
            Guid deviceId;
            await using (var insert = new NpgsqlCommand("""
                INSERT INTO devices (device_code, serial_number, status_id, site_id, current_location_site_id, health_check_status, notes, data_source, created_by)
                VALUES (@code, @serial, 2, @site, @site, @health, @notes, 'manual', @actor) RETURNING device_id
                """, connection, transaction))
            {
                insert.Parameters.AddWithValue("code", code);
                insert.Parameters.AddWithValue("serial", serial);
                insert.Parameters.AddWithValue("site", siteId);
                insert.Parameters.AddWithValue("health", health);
                insert.Parameters.Add("notes", NpgsqlDbType.Varchar).Value = (object?)notes ?? DBNull.Value;
                insert.Parameters.AddWithValue("actor", user.UserId);
                deviceId = (Guid)(await insert.ExecuteScalarAsync(ct))!;
            }
            await WriteHistoryAsync(connection, transaction, user, siteId, deviceId, code, "INSERT", "device_register", "registered", "Registered as In Stock RFU", null,
                null, new { device_code = code, serial_number = serial, status = "in_stock_rfu", site_id = siteId, notes, health_check_status = health }, requestId, ct);
            await using (var save = new NpgsqlCommand("""
                INSERT INTO idempotency_keys (user_id, idempotency_key, activity_type, request_hash, device_id)
                VALUES (@user, @key, 'device', @hash, @device)
                """, connection, transaction))
            {
                save.Parameters.AddWithValue("user", user.UserId);
                save.Parameters.AddWithValue("key", key);
                save.Parameters.AddWithValue("hash", hash);
                save.Parameters.AddWithValue("device", deviceId);
                await save.ExecuteNonQueryAsync(ct);
            }
            var created = await FetchAsync(connection, transaction, deviceId, ct);
            commitStarted = true;
            await transaction.CommitAsync(ct);
            return Results.Created($"/api/devices/{deviceId}", created);
        }
        catch (PostgresException error) when (error.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            app.Logger.LogWarning("Device create conflict, constraint {Constraint}, request {RequestId}.", error.ConstraintName, requestId);
            return Duplicate(error);
        }
        catch (PostgresException error)
        {
            app.Logger.LogError("Device create rejected, SQL state {SqlState}, constraint {Constraint}, request {RequestId}.", error.SqlState, error.ConstraintName, requestId);
            return Error(422, "DATABASE_CONSTRAINT", "Database rejected the device data.");
        }
        catch (NpgsqlException)
        {
            return commitStarted
                ? Error(503, "COMMIT_OUTCOME_UNKNOWN", "The outcome could not be confirmed. Retry with the same Idempotency-Key.")
                : Error(503, "DATABASE_UNAVAILABLE", "Database unavailable.");
        }
    }

    /* ----------------------------------------------------------------- update */

    private static async Task<IResult> UpdateAsync(WebApplication app, Func<string> getConnectionString, HttpContext context, Guid id, UpdateDeviceRequest input, CancellationToken ct)
    {
        if (!AuthEndpoints.HasAllowedOrigin(context)) return Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
        var token = context.Request.Cookies["mh02_session"];
        if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
        if (!ParseRowVersion(input.RowVersion, out var rowVersion)) return Error(400, "VALIDATION_FAILED", "rowVersion is required.");
        var code = input.DeviceCode?.Trim();
        var serial = input.SerialNumber?.Trim();
        var notesGiven = input.Notes is not null;
        var notes = Clean(input.Notes);
        if ((code is not null && !Regex.IsMatch(code, "^[A-Za-z0-9._-]{1,40}$")) || (serial is not null && serial.Length is 0 or > 80) ||
            (notes?.Length ?? 0) > 500 || (input.HealthCheckStatus is not null && !Health.Contains(input.HealthCheckStatus)))
            return Error(400, "VALIDATION_FAILED", "The request is not valid.");

        var requestId = context.Response.Headers["X-Request-Id"].ToString();
        var commitStarted = false;
        try
        {
            await using var connection = new NpgsqlConnection(getConnectionString());
            await connection.OpenAsync(ct);
            await using var transaction = await connection.BeginTransactionAsync(ct);
            var user = await SessionStore.FindUserAsync(connection, token, ct);
            if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (user.Role != "superadmin") return Error(403, "SUPERADMIN_ONLY", "Only a Super Admin can do this.");

            string oldCode, oldSerial, oldHealth;
            string? oldNotes;
            int siteId;
            bool archived;
            long currentVersion;
            await using (var select = new NpgsqlCommand("SELECT device_code, serial_number, notes, health_check_status, site_id, is_deleted, row_version FROM devices WHERE device_id = @id FOR UPDATE", connection, transaction))
            {
                select.Parameters.AddWithValue("id", id);
                await using var reader = await select.ExecuteReaderAsync(ct);
                if (!await reader.ReadAsync(ct)) return Error(404, "NOT_FOUND", "Device not found.");
                oldCode = reader.GetString(0); oldSerial = reader.GetString(1); oldNotes = reader.IsDBNull(2) ? null : reader.GetString(2);
                oldHealth = reader.GetString(3); siteId = reader.GetInt32(4); archived = reader.GetBoolean(5); currentVersion = reader.GetInt64(6);
            }
            if (currentVersion != rowVersion) return Error(409, "STALE_VERSION", "The device was changed by someone else. Reload and try again.");
            if (archived) return Error(409, "DEVICE_ARCHIVED", "An archived device cannot be edited.");

            var before = new Dictionary<string, object?>();
            var after = new Dictionary<string, object?>();
            var newCode = oldCode; var newSerial = oldSerial; var newNotes = oldNotes; var newHealth = oldHealth;
            if (code is not null && code != oldCode) { before["device_code"] = oldCode; after["device_code"] = code; newCode = code; }
            if (serial is not null && serial != oldSerial) { before["serial_number"] = oldSerial; after["serial_number"] = serial; newSerial = serial; }
            if (notesGiven && notes != oldNotes) { before["notes"] = oldNotes; after["notes"] = notes; newNotes = notes; }
            if (input.HealthCheckStatus is not null && input.HealthCheckStatus != oldHealth) { before["health_check_status"] = oldHealth; after["health_check_status"] = input.HealthCheckStatus; newHealth = input.HealthCheckStatus; }
            if (after.Count == 0) return Results.Ok(await FetchAsync(connection, transaction, id, ct)); // nothing changed: no write, no audit row

            await using (var update = new NpgsqlCommand("""
                UPDATE devices SET device_code = @code, serial_number = @serial, notes = @notes, health_check_status = @health,
                    updated_at = CURRENT_TIMESTAMP, updated_by = @actor WHERE device_id = @id
                """, connection, transaction))
            {
                update.Parameters.AddWithValue("id", id);
                update.Parameters.AddWithValue("code", newCode);
                update.Parameters.AddWithValue("serial", newSerial);
                update.Parameters.Add("notes", NpgsqlDbType.Varchar).Value = (object?)newNotes ?? DBNull.Value;
                update.Parameters.AddWithValue("health", newHealth);
                update.Parameters.AddWithValue("actor", user.UserId);
                await update.ExecuteNonQueryAsync(ct);
            }
            await WriteHistoryAsync(connection, transaction, user, siteId, id, newCode, "UPDATE", "device_update", "details_updated",
                $"Details updated: {string.Join(", ", after.Keys)}", null, before, after, requestId, ct);
            var updated = await FetchAsync(connection, transaction, id, ct);
            commitStarted = true;
            await transaction.CommitAsync(ct);
            return Results.Ok(updated);
        }
        catch (PostgresException error) when (error.SqlState == PostgresErrorCodes.UniqueViolation) { return Duplicate(error); }
        catch (PostgresException error)
        {
            app.Logger.LogError("Device update rejected, SQL state {SqlState}, constraint {Constraint}, request {RequestId}.", error.SqlState, error.ConstraintName, requestId);
            return Error(422, "DATABASE_CONSTRAINT", "Database rejected the device data.");
        }
        catch (NpgsqlException)
        {
            return commitStarted ? Error(503, "COMMIT_OUTCOME_UNKNOWN", "The outcome could not be confirmed. Reload before retrying.") : Error(503, "DATABASE_UNAVAILABLE", "Database unavailable.");
        }
    }

    /* ---------------------------------------------------------------- archive */

    private static async Task<IResult> ArchiveAsync(WebApplication app, Func<string> getConnectionString, HttpContext context, Guid id, ArchiveDeviceRequest input, CancellationToken ct)
    {
        if (!AuthEndpoints.HasAllowedOrigin(context)) return Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
        var token = context.Request.Cookies["mh02_session"];
        if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
        if (!ParseRowVersion(input.RowVersion, out var rowVersion)) return Error(400, "VALIDATION_FAILED", "rowVersion is required.");
        var reason = Clean(input.Reason);
        if ((reason?.Length ?? 0) > 500) return Error(400, "VALIDATION_FAILED", "The request is not valid.");

        var requestId = context.Response.Headers["X-Request-Id"].ToString();
        var commitStarted = false;
        try
        {
            await using var connection = new NpgsqlConnection(getConnectionString());
            await connection.OpenAsync(ct);
            await using var transaction = await connection.BeginTransactionAsync(ct);
            var user = await SessionStore.FindUserAsync(connection, token, ct);
            if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (user.Role != "superadmin") return Error(403, "SUPERADMIN_ONLY", "Only a Super Admin can do this.");

            string code;
            int siteId, statusId;
            bool archived;
            long currentVersion;
            await using (var select = new NpgsqlCommand("SELECT device_code, site_id, status_id, is_deleted, row_version FROM devices WHERE device_id = @id FOR UPDATE", connection, transaction))
            {
                select.Parameters.AddWithValue("id", id);
                await using var reader = await select.ExecuteReaderAsync(ct);
                if (!await reader.ReadAsync(ct)) return Error(404, "NOT_FOUND", "Device not found.");
                code = reader.GetString(0); siteId = reader.GetInt32(1); statusId = reader.GetInt32(2); archived = reader.GetBoolean(3); currentVersion = reader.GetInt64(4);
            }
            if (currentVersion != rowVersion) return Error(409, "STALE_VERSION", "The device was changed by someone else. Reload and try again.");
            if (archived) return Error(409, "DEVICE_ALREADY_ARCHIVED", "The device is already archived.");
            if (statusId == 1) return Error(409, "DEVICE_IN_USE", "An In Use device cannot be archived. Remove it from its Unit first.");

            await using (var update = new NpgsqlCommand("""
                UPDATE devices SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP, deleted_by = @actor,
                    updated_at = CURRENT_TIMESTAMP, updated_by = @actor WHERE device_id = @id
                """, connection, transaction))
            {
                update.Parameters.AddWithValue("id", id);
                update.Parameters.AddWithValue("actor", user.UserId);
                await update.ExecuteNonQueryAsync(ct);
            }
            await WriteHistoryAsync(connection, transaction, user, siteId, id, code, "UPDATE", "device_archive", "soft_deleted", "Archived", reason,
                new { is_archived = false }, new { is_archived = true }, requestId, ct);
            var result = await FetchAsync(connection, transaction, id, ct);
            commitStarted = true;
            await transaction.CommitAsync(ct);
            return Results.Ok(result);
        }
        catch (PostgresException error)
        {
            app.Logger.LogError("Device archive rejected, SQL state {SqlState}, constraint {Constraint}, request {RequestId}.", error.SqlState, error.ConstraintName, requestId);
            return Error(422, "DATABASE_CONSTRAINT", "Database rejected the change.");
        }
        catch (NpgsqlException)
        {
            return commitStarted ? Error(503, "COMMIT_OUTCOME_UNKNOWN", "The outcome could not be confirmed. Reload before retrying.") : Error(503, "DATABASE_UNAVAILABLE", "Database unavailable.");
        }
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}
