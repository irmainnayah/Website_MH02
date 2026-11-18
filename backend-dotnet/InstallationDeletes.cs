using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

public static class InstallationDeletes
{
    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapDelete("/api/installations/{id:guid}", async (HttpContext context, Guid id, CancellationToken cancellationToken) =>
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
                if (user.Role != "superadmin") return Error(403, "SUPERADMIN_ONLY", "Only a Super Admin can do this.");

                string formNumber, zone;
                int siteId;
                DateTime started, created, startedLocal;
                await using (var head = new NpgsqlCommand("""
                    SELECT form_number, site_id, started_at, created_at, time_zone_id,
                           (started_at AT TIME ZONE 'UTC') + make_interval(mins => start_utc_offset_minutes)
                    FROM activities WHERE activity_id = @id AND activity_type = 'installation' FOR UPDATE
                    """, connection, transaction))
                {
                    head.Parameters.AddWithValue("id", id);
                    await using var reader = await head.ExecuteReaderAsync(cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken)) return Error(404, "NOT_FOUND", "Installation not found.");
                    formNumber = reader.GetString(0); siteId = reader.GetInt32(1);
                    started = reader.GetDateTime(2); created = reader.GetDateTime(3); zone = reader.GetString(4); startedLocal = reader.GetDateTime(5);
                }

                Guid deviceId;
                string deviceCode, deviceRole, beforeStatusCode, afterStatusCode;
                int deviceSite, beforeStatus;
                Guid? beforeUnit;
                int? beforeLocation;
                DateOnly? beforeMaintenance;
                await using (var snapshot = new NpgsqlCommand("""
                    SELECT d.device_id, d.device_code, d.site_id, ad.role, ad.before_status_id, ad.before_unit_id,
                           ad.before_location_site_id, ad.before_last_maintenance_date, d.is_deleted,
                           d.status_id = ad.after_status_id AND d.current_unit_id IS NOT DISTINCT FROM ad.after_unit_id
                               AND d.current_location_site_id IS NOT DISTINCT FROM ad.after_location_site_id
                               AND d.last_maintenance_date IS NOT DISTINCT FROM ad.after_last_maintenance_date AS state_matches,
                           bs.code, afs.code
                    FROM activity_devices ad JOIN devices d ON d.device_id = ad.device_id
                    JOIN device_statuses bs ON bs.status_id = ad.before_status_id
                    JOIN device_statuses afs ON afs.status_id = ad.after_status_id
                    WHERE ad.activity_id = @id ORDER BY d.device_code FOR UPDATE OF d
                    """, connection, transaction))
                {
                    snapshot.Parameters.AddWithValue("id", id);
                    await using var reader = await snapshot.ExecuteReaderAsync(cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken)) return Error(500, "INTERNAL_ERROR", "The transaction has no device snapshot.");
                    deviceId = reader.GetGuid(0); deviceCode = reader.GetString(1); deviceSite = reader.GetInt32(2); deviceRole = reader.GetString(3);
                    beforeStatus = reader.GetInt32(4); beforeUnit = reader.IsDBNull(5) ? null : reader.GetGuid(5);
                    beforeLocation = reader.IsDBNull(6) ? null : reader.GetInt32(6);
                    beforeMaintenance = reader.IsDBNull(7) ? null : reader.GetFieldValue<DateOnly>(7);
                    if (reader.GetBoolean(8)) return Error(409, "DEVICE_ARCHIVED", "The Device is archived.");
                    if (!reader.GetBoolean(9)) return Error(409, "DEVICE_STATE_CHANGED", "The Device state changed after this transaction.");
                    beforeStatusCode = reader.GetString(10); afterStatusCode = reader.GetString(11);
                    if (await reader.ReadAsync(cancellationToken)) return Error(500, "INTERNAL_ERROR", "The installation has multiple device snapshots.");
                }
                await using (var later = new NpgsqlCommand("""
                    SELECT EXISTS (
                        SELECT 1 FROM activity_devices x JOIN activities a ON a.activity_id = x.activity_id
                        WHERE x.device_id = @device AND a.activity_id <> @id
                          AND (a.started_at > @started OR (a.started_at = @started AND a.created_at > @created))
                    )
                    """, connection, transaction))
                {
                    later.Parameters.AddWithValue("device", deviceId); later.Parameters.AddWithValue("id", id);
                    later.Parameters.AddWithValue("started", started); later.Parameters.AddWithValue("created", created);
                    if ((bool)(await later.ExecuteScalarAsync(cancellationToken))!)
                        return Error(409, "LATER_ACTIVITY_EXISTS", "A later activity exists for this Device.");
                }
                await using (var photos = new NpgsqlCommand("SELECT photo_id, storage_provider, storage_path, mime_type FROM transaction_photos WHERE activity_id = @id FOR UPDATE", connection, transaction))
                {
                    photos.Parameters.AddWithValue("id", id);
                    await using var reader = await photos.ExecuteReaderAsync(cancellationToken);
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        if (reader.GetString(1) != "local_fs") return Error(409, "PHOTO_DELETE_UNAVAILABLE", "Photo storage provider is not supported.");
                        var extension = reader.GetString(3) switch { "image/jpeg" => "jpg", "image/png" => "png", "image/webp" => "webp", _ => "" };
                        if (extension.Length == 0) return Error(409, "PHOTO_DELETE_UNAVAILABLE", "Photo type is not supported.");
                        photoPaths.Add((reader.GetGuid(0), InstallationUploads.ResolvePath(InstallationUploads.StorageRoot(app), reader.GetString(2)), extension));
                    }
                }
                if (beforeUnit is not null)
                {
                    await using var occupied = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM devices WHERE current_unit_id = @unit AND device_id <> @device)", connection, transaction);
                    occupied.Parameters.AddWithValue("unit", beforeUnit.Value); occupied.Parameters.AddWithValue("device", deviceId);
                    if ((bool)(await occupied.ExecuteScalarAsync(cancellationToken))!) return Error(409, "UNIT_OCCUPIED", "The previous Unit is occupied.");
                }

                var group = Guid.NewGuid();
                await using var save = new NpgsqlCommand("""
                    UPDATE devices SET status_id = @before_status, current_unit_id = @before_unit,
                        current_location_site_id = @before_location, last_maintenance_date = @before_maintenance,
                        updated_at = CURRENT_TIMESTAMP, updated_by = @actor WHERE device_id = @device;
                    INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation,
                        old_values, change_group_id, request_id, action)
                    VALUES (@actor, @actor_name, @site, 'installation', @form, @id, 'DELETE', @activity_old, @group, @request_id, 'transaction_delete');
                    WITH device_audit AS (
                        INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation,
                            old_values, new_values, change_group_id, request_id, action)
                        VALUES (@actor, @actor_name, @device_site, 'device', @device_code, @device, 'UPDATE', @device_old,
                            @device_new, @group, @request_id, 'transaction_delete') RETURNING audit_id
                    )
                    INSERT INTO device_events (device_id, event_type, actor_user_id, actor_name, site_id, audit_id,
                        source_activity_id, source_activity_type, source_form_number, source_role, source_started_at_local, source_time_zone_id)
                    SELECT @device, 'transaction_deleted', @actor, @actor_name, @device_site, audit_id,
                        @id, 'installation', @form, @role, @started_local, @zone FROM device_audit;
                    DELETE FROM activities WHERE activity_id = @id
                    """, connection, transaction);
                save.Parameters.AddWithValue("id", id); save.Parameters.AddWithValue("device", deviceId); save.Parameters.AddWithValue("form", formNumber);
                save.Parameters.AddWithValue("site", siteId); save.Parameters.AddWithValue("device_site", deviceSite); save.Parameters.AddWithValue("device_code", deviceCode);
                save.Parameters.AddWithValue("actor", user.UserId); save.Parameters.AddWithValue("actor_name", user.Name);
                save.Parameters.AddWithValue("group", group); save.Parameters.AddWithValue("request_id", context.Response.Headers["X-Request-Id"].ToString());
                save.Parameters.AddWithValue("role", deviceRole); save.Parameters.AddWithValue("started_local", DateTime.SpecifyKind(startedLocal, DateTimeKind.Unspecified));
                save.Parameters.AddWithValue("zone", zone); save.Parameters.AddWithValue("before_status", beforeStatus);
                save.Parameters.Add("before_unit", NpgsqlDbType.Uuid).Value = (object?)beforeUnit ?? DBNull.Value;
                save.Parameters.Add("before_location", NpgsqlDbType.Integer).Value = (object?)beforeLocation ?? DBNull.Value;
                save.Parameters.Add("before_maintenance", NpgsqlDbType.Date).Value = (object?)beforeMaintenance ?? DBNull.Value;
                save.Parameters.AddWithValue("activity_old", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new { formNumber, activityType = "installation", photoCount = photoPaths.Count }));
                save.Parameters.AddWithValue("device_old", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new { status = afterStatusCode }));
                save.Parameters.AddWithValue("device_new", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new { status = beforeStatusCode, unitId = beforeUnit, deletedFormNumber = formNumber }));
                await save.ExecuteNonQueryAsync(cancellationToken);
                commitStarted = true;
                await transaction.CommitAsync(cancellationToken);
                foreach (var photo in photoPaths)
                {
                    try
                    {
                        var quarantine = Path.Combine(InstallationUploads.StorageRoot(app), "_quarantine");
                        Directory.CreateDirectory(quarantine);
                        if (File.Exists(photo.Path)) File.Move(photo.Path, Path.Combine(quarantine, $"{photo.Id}.{photo.Extension}"), overwrite: false);
                    }
                    catch (IOException) { app.Logger.LogWarning("Unable to quarantine a deleted installation photo."); }
                    catch (UnauthorizedAccessException) { app.Logger.LogWarning("Unable to quarantine a deleted installation photo."); }
                }
                return Results.Ok(new { deleted = true, formNumber });
            }
            catch (NpgsqlException)
            {
                return commitStarted
                    ? Error(503, "COMMIT_OUTCOME_UNKNOWN", "The outcome could not be confirmed. Reload before retrying.")
                    : Error(503, "DATABASE_UNAVAILABLE", "Database unavailable.");
            }
                    catch (IOException) { return Error(503, "PHOTO_STORAGE_UNAVAILABLE", "Photo storage unavailable."); }
        });
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}