using System.Globalization;
using System.Net;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

/// <summary>
/// PATCH /api/installations/{id} (Super Admin). Metadata edits touch no device. Master edits (device, Unit, start/finish
/// time) follow design 6: refuse when a later activity exists, the device is archived or its state changed since; restore
/// the device to its before-snapshot, re-validate the new values exactly as a creation would, re-apply, rewrite the
/// snapshot and write audit rows, all in ONE transaction. Times are re-resolved in the activity's SNAPSHOTTED zone; an
/// unchanged time keeps its stored instant and offset. The form number, Site and zone never change.
/// </summary>
public static class InstallationUpdates
{
    private sealed record Field(string Column, bool IsDetail, int MaxLength);

    private static readonly Dictionary<string, Field> Fields = new(StringComparer.Ordinal)
    {
        ["shift"] = new("shift", false, 10), ["groupLeader"] = new("group_leader", false, 120),
        ["remarks"] = new("remarks", false, 1000), ["sourcePower"] = new("source_power", true, 60),
        ["spmVersion"] = new("spm_version", true, 60), ["area"] = new("area", true, 60),
        ["locationDetail"] = new("location_detail", true, 200), ["ipAddress"] = new("ip_address", true, 45),
        ["ipCpe"] = new("ip_cpe", true, 45), ["ipVhms"] = new("ip_vhms", true, 45), ["notes"] = new("notes", true, 1000)
    };

    private static readonly string[] MasterNames = ["deviceCode", "unitNo", "startedAt", "finishedAt"];
    private const string LocalFormat = "yyyy-MM-dd'T'HH:mm";

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapPatch("/api/installations/{id:guid}", (HttpContext context, Guid id, CancellationToken cancellationToken) => HandleAsync(app, getConnectionString, context, id, cancellationToken));
    }

    private static string StatusCode(int id) => id switch { 1 => "in_use", 2 => "in_stock_rfu", 3 => "in_stock_damaged", 4 => "in_stock_ho", _ => id.ToString(CultureInfo.InvariantCulture) };

    internal static async Task<IResult> HandleAsync(WebApplication app, Func<string> getConnectionString, HttpContext context, Guid id, CancellationToken cancellationToken)
    {
        if (!AuthEndpoints.HasAllowedOrigin(context)) return Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
        var token = context.Request.Cookies["mh02_session"];
        if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
        var updates = new Dictionary<string, string>(StringComparer.Ordinal);
        long expectedVersion;
        try
        {
            using var document = await JsonDocument.ParseAsync(context.Request.Body, cancellationToken: cancellationToken);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("rowVersion", out var versionElement) ||
                versionElement.ValueKind != JsonValueKind.String)
                return Error(400, "VALIDATION_FAILED", "rowVersion is required.");
            var version = versionElement.GetString();
            if (version is null || version.Length != 18 || !version.StartsWith("0x", StringComparison.OrdinalIgnoreCase) ||
                !long.TryParse(version.AsSpan(2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out expectedVersion) || expectedVersion < 1)
                return Error(400, "VALIDATION_FAILED", "rowVersion is invalid.");
            foreach (var property in root.EnumerateObject())
            {
                if (property.Name == "rowVersion") continue;
                var isMaster = MasterNames.Contains(property.Name);
                if ((!isMaster && !Fields.ContainsKey(property.Name)) || property.Value.ValueKind != JsonValueKind.String)
                    return Error(400, "VALIDATION_FAILED", "Only installation fields can be updated by this endpoint (the Site, zone and form number are fixed).");
                var value = property.Value.GetString()!.Trim();
                var bad = isMaster
                    ? property.Name switch
                    {
                        "deviceCode" => value.Length is 0 or > 40,
                        "unitNo" => value.Length is 0 or > 30,
                        _ => !DateTime.TryParseExact(value, LocalFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out _),
                    }
                    : value.Length > Fields[property.Name].MaxLength || (property.Name == "shift" && value is not ("Shift 1" or "Shift 2")) ||
                      ((property.Name is "ipAddress" or "ipCpe" or "ipVhms") && value.Length > 0 && !IPAddress.TryParse(value, out _));
                if (bad || !updates.TryAdd(property.Name, value)) return Error(400, "VALIDATION_FAILED", "The request is not valid.");
            }
        }
        catch (JsonException) { return Error(400, "INVALID_JSON", "The request body must be valid JSON."); }

        var commitStarted = false;
        var requestId = context.Response.Headers["X-Request-Id"].ToString();
        try
        {
            await using var connection = new NpgsqlConnection(getConnectionString());
            await connection.OpenAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
            var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
            if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (user.Role != "superadmin") return Error(403, "SUPERADMIN_ONLY", "Only a Super Admin can do this.");

            string formNumber, zone;
            int siteId, startOffset, finishOffset;
            long currentVersion;
            Guid? currentUnitId;
            DateTime startedUtc, finishedUtc, createdAt;
            var current = new Dictionary<string, string?>(StringComparer.Ordinal);
            await using (var select = new NpgsqlCommand("""
                SELECT a.form_number, a.site_id, a.row_version, a.shift, a.group_leader, a.remarks,
                       i.source_power, i.spm_version, i.area, i.location_detail, i.ip_address, i.ip_cpe, i.ip_vhms, i.notes,
                       a.unit_id, a.started_at, a.finished_at, a.created_at, a.time_zone_id,
                       a.start_utc_offset_minutes, a.finish_utc_offset_minutes
                FROM activities a JOIN installation_details i ON i.activity_id = a.activity_id
                WHERE a.activity_id = @id AND a.activity_type = 'installation' FOR UPDATE OF a, i
                """, connection, transaction))
            {
                select.Parameters.AddWithValue("id", id);
                await using var reader = await select.ExecuteReaderAsync(cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Error(404, "NOT_FOUND", "Installation not found.");
                formNumber = reader.GetString(0); siteId = reader.GetInt32(1); currentVersion = reader.GetInt64(2);
                var names = new[] { "shift", "groupLeader", "remarks", "sourcePower", "spmVersion", "area", "locationDetail", "ipAddress", "ipCpe", "ipVhms", "notes" };
                for (var index = 0; index < names.Length; index++) current[names[index]] = reader.IsDBNull(index + 3) ? null : reader.GetString(index + 3);
                currentUnitId = reader.IsDBNull(14) ? null : reader.GetGuid(14);
                startedUtc = reader.GetDateTime(15); finishedUtc = reader.GetDateTime(16); createdAt = reader.GetDateTime(17);
                zone = reader.GetString(18); startOffset = reader.GetInt16(19); finishOffset = reader.GetInt16(20);
            }
            if (currentVersion != expectedVersion) return Error(409, "STALE_VERSION", "The transaction was changed. Reload and try again.");

            // Current values of the master fields (the stored local wall-clock time, the device code and the Unit number).
            var startLocalCurrent = DateTime.SpecifyKind(startedUtc, DateTimeKind.Utc).AddMinutes(startOffset);
            var finishLocalCurrent = DateTime.SpecifyKind(finishedUtc, DateTimeKind.Utc).AddMinutes(finishOffset);
            current["startedAt"] = startLocalCurrent.ToString(LocalFormat, CultureInfo.InvariantCulture);
            current["finishedAt"] = finishLocalCurrent.ToString(LocalFormat, CultureInfo.InvariantCulture);
            Guid oldDeviceId = Guid.Empty;
            bool oldArchived = false, oldStateMatches = false;
            int beforeStatus = 2;
            Guid? beforeUnit = null;
            int? beforeLocation = null;
            DateOnly? beforeMaintenance = null;
            await using (var snap = new NpgsqlCommand("""
                SELECT d.device_id, d.device_code, d.is_deleted,
                       d.status_id = ad.after_status_id AND d.current_unit_id IS NOT DISTINCT FROM ad.after_unit_id
                           AND d.current_location_site_id IS NOT DISTINCT FROM ad.after_location_site_id
                           AND d.last_maintenance_date IS NOT DISTINCT FROM ad.after_last_maintenance_date,
                       ad.before_status_id, ad.before_unit_id, ad.before_location_site_id, ad.before_last_maintenance_date
                FROM activity_devices ad JOIN devices d ON d.device_id = ad.device_id
                WHERE ad.activity_id = @id AND ad.role = 'subject' FOR UPDATE OF d
                """, connection, transaction))
            {
                snap.Parameters.AddWithValue("id", id);
                await using var reader = await snap.ExecuteReaderAsync(cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Error(500, "INTERNAL_ERROR", "The installation has no device snapshot.");
                oldDeviceId = reader.GetGuid(0); current["deviceCode"] = reader.GetString(1); oldArchived = reader.GetBoolean(2); oldStateMatches = reader.GetBoolean(3);
                beforeStatus = reader.GetInt32(4); beforeUnit = reader.IsDBNull(5) ? null : reader.GetGuid(5);
                beforeLocation = reader.IsDBNull(6) ? null : reader.GetInt32(6); beforeMaintenance = reader.IsDBNull(7) ? null : reader.GetFieldValue<DateOnly>(7);
            }
            if (currentUnitId is not null)
            {
                await using var unitNo = new NpgsqlCommand("SELECT unit_no FROM fleet_units WHERE unit_id = @id", connection, transaction);
                unitNo.Parameters.AddWithValue("id", currentUnitId.Value);
                current["unitNo"] = (string?)await unitNo.ExecuteScalarAsync(cancellationToken);
            }

            var changed = updates.Where(entry => current[entry.Key] != entry.Value).ToArray();
            if (changed.Length == 0) return Results.Ok(new { activityId = id, rowVersion = $"0x{currentVersion:x16}" });
            var masterChanged = changed.Any(entry => MasterNames.Contains(entry.Key));
            var auditRows = new List<(Guid DeviceId, string Code, object Old, object New)>();
            var headerSets = new List<string>();
            var header = new NpgsqlCommand { Connection = connection, Transaction = transaction };
            header.Parameters.AddWithValue("id", id);
            header.Parameters.AddWithValue("actor", user.UserId);
            Guid? newUnitIdForDetails = null;

            if (masterChanged)
            {
                // Rule 1: a later activity (started_at, then created_at) on the device blocks the edit.
                async Task<string?> LaterAsync(Guid deviceId, DateTime start, DateTime created)
                {
                    await using var later = new NpgsqlCommand("""
                        SELECT a2.form_number FROM activity_devices x JOIN activities a2 ON a2.activity_id = x.activity_id
                        WHERE x.device_id = @device AND a2.activity_id <> @id
                          AND (a2.started_at > @start OR (a2.started_at = @start AND a2.created_at > @created))
                        ORDER BY a2.started_at, a2.created_at LIMIT 1
                        """, connection, transaction);
                    later.Parameters.AddWithValue("device", deviceId); later.Parameters.AddWithValue("id", id);
                    later.Parameters.AddWithValue("start", start); later.Parameters.AddWithValue("created", createdAt);
                    return (string?)await later.ExecuteScalarAsync(cancellationToken);
                }
                var blocking = await LaterAsync(oldDeviceId, startedUtc, createdAt);
                if (blocking is not null) return Error(409, "LATER_ACTIVITY_EXISTS", $"This installation cannot be changed because a later activity ({blocking}) exists for the same device.");
                if (oldArchived) return Error(409, "DEVICE_ARCHIVED", "The device is archived; this installation cannot be changed.");
                if (!oldStateMatches) return Error(409, "DEVICE_STATE_CHANGED", "The device changed after this installation; it cannot be rolled back safely.");

                // Times: re-resolved in the snapshotted zone; an unchanged time keeps its stored instant and offset.
                TimeZoneInfo timeZone;
                try { timeZone = TimeZoneInfo.FindSystemTimeZoneById(zone); }
                catch (TimeZoneNotFoundException) { return Error(503, "TIME_ZONE_UNAVAILABLE", "The Site time zone is unavailable."); }
                var newStartUtc = startedUtc; var newFinishUtc = finishedUtc;
                var newStartOffset = startOffset; var newFinishOffset = finishOffset;
                var newFinishLocal = finishLocalCurrent;
                if (updates.TryGetValue("startedAt", out var startText) && changed.Any(entry => entry.Key == "startedAt"))
                {
                    var local = DateTime.ParseExact(startText, LocalFormat, CultureInfo.InvariantCulture);
                    if (timeZone.IsInvalidTime(local) || timeZone.IsAmbiguousTime(local)) return Error(422, "INVALID_DATETIME", "The local time cannot be resolved.");
                    var offset = timeZone.GetUtcOffset(local);
                    newStartUtc = new DateTimeOffset(local, offset).UtcDateTime; newStartOffset = (int)offset.TotalMinutes;
                }
                var finishChanged = changed.Any(entry => entry.Key == "finishedAt");
                if (finishChanged)
                {
                    var local = DateTime.ParseExact(updates["finishedAt"], LocalFormat, CultureInfo.InvariantCulture);
                    if (timeZone.IsInvalidTime(local) || timeZone.IsAmbiguousTime(local)) return Error(422, "INVALID_DATETIME", "The local time cannot be resolved.");
                    var offset = timeZone.GetUtcOffset(local);
                    newFinishUtc = new DateTimeOffset(local, offset).UtcDateTime; newFinishOffset = (int)offset.TotalMinutes; newFinishLocal = local;
                }
                if (newFinishUtc < newStartUtc) return Error(422, "FINISH_BEFORE_START", "finishedAt must not be before startedAt.");
                if (finishChanged && newFinishUtc > DateTime.UtcNow.AddSeconds(120)) return Error(422, "FINISH_IN_FUTURE", "finishedAt cannot be in the future.");

                // Restore the previous device to its before-snapshot (design 6, rule 2/3).
                await using (var restore = new NpgsqlCommand("""
                    UPDATE devices SET status_id = @status, current_unit_id = @unit, current_location_site_id = @loc,
                        last_maintenance_date = @maint, updated_at = CURRENT_TIMESTAMP, updated_by = @actor WHERE device_id = @device
                    """, connection, transaction))
                {
                    restore.Parameters.AddWithValue("status", beforeStatus);
                    restore.Parameters.Add("unit", NpgsqlDbType.Uuid).Value = (object?)beforeUnit ?? DBNull.Value;
                    restore.Parameters.Add("loc", NpgsqlDbType.Integer).Value = (object?)beforeLocation ?? DBNull.Value;
                    restore.Parameters.Add("maint", NpgsqlDbType.Date).Value = (object?)beforeMaintenance ?? DBNull.Value;
                    restore.Parameters.AddWithValue("actor", user.UserId); restore.Parameters.AddWithValue("device", oldDeviceId);
                    await restore.ExecuteNonQueryAsync(cancellationToken);
                }

                // Re-validate the new values as a creation would: Unit first, then device.
                var unitId = currentUnitId; var equipmentUnitChanged = false;
                if (changed.Any(entry => entry.Key == "unitNo"))
                {
                    await using var unit = new NpgsqlCommand("SELECT unit_id, site_id, is_active FROM fleet_units WHERE unit_no = @no FOR UPDATE", connection, transaction);
                    unit.Parameters.AddWithValue("no", updates["unitNo"]);
                    await using var reader = await unit.ExecuteReaderAsync(cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken) || reader.GetInt32(1) != siteId) return Error(422, "UNIT_NOT_FOUND", "The Unit does not exist in this Site.");
                    if (!reader.GetBoolean(2)) return Error(422, "UNIT_INACTIVE", "The Unit is inactive.");
                    unitId = reader.GetGuid(0); equipmentUnitChanged = true;
                }
                if (unitId is null) return Error(500, "INTERNAL_ERROR", "The installation has no Unit.");
                var deviceId = oldDeviceId; var deviceCode = current["deviceCode"]!;
                int devStatus; int? devLocation; DateOnly? devMaintenance; Guid? devUnit;
                {
                    var changedDevice = changed.Any(entry => entry.Key == "deviceCode");
                    await using var device = new NpgsqlCommand(changedDevice
                        ? "SELECT device_id, device_code, site_id, status_id, is_deleted, current_location_site_id, last_maintenance_date, current_unit_id FROM devices WHERE device_code = @code FOR UPDATE"
                        : "SELECT device_id, device_code, site_id, status_id, is_deleted, current_location_site_id, last_maintenance_date, current_unit_id FROM devices WHERE device_id = @device FOR UPDATE", connection, transaction);
                    if (changedDevice) device.Parameters.AddWithValue("code", updates["deviceCode"]); else device.Parameters.AddWithValue("device", oldDeviceId);
                    await using var reader = await device.ExecuteReaderAsync(cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken) || reader.GetInt32(2) != siteId) return Error(422, "DEVICE_NOT_FOUND", "The Device does not exist in this Site.");
                    if (reader.GetBoolean(4) || reader.GetInt32(3) != 2) return Error(422, "DEVICE_NOT_AVAILABLE", "The Device is not available for installation.");
                    deviceId = reader.GetGuid(0); deviceCode = reader.GetString(1); devStatus = reader.GetInt32(3);
                    devLocation = reader.IsDBNull(5) ? null : reader.GetInt32(5); devMaintenance = reader.IsDBNull(6) ? null : reader.GetFieldValue<DateOnly>(6);
                    devUnit = reader.IsDBNull(7) ? null : reader.GetGuid(7);
                }
                await using (var occupied = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM devices WHERE current_unit_id = @unit)", connection, transaction))
                {
                    occupied.Parameters.AddWithValue("unit", unitId.Value);
                    if ((bool)(await occupied.ExecuteScalarAsync(cancellationToken))!) return Error(422, "UNIT_OCCUPIED", "The Unit already has a device installed.");
                }
                // Rule 6: the edited start must keep this activity the latest on the (new) device.
                var laterNew = await LaterAsync(deviceId, newStartUtc, createdAt);
                if (laterNew is not null) return Error(409, "LATER_ACTIVITY_EXISTS", $"The edit would place this installation before a later activity ({laterNew}) on the same device.");

                var localFinishDate = DateOnly.FromDateTime(newFinishLocal);
                await using (var apply = new NpgsqlCommand("""
                    UPDATE devices SET status_id = 1, current_unit_id = @unit, current_location_site_id = @site, last_maintenance_date = @maint,
                        updated_at = CURRENT_TIMESTAMP, updated_by = @actor WHERE device_id = @device
                    """, connection, transaction))
                {
                    apply.Parameters.AddWithValue("unit", unitId.Value); apply.Parameters.AddWithValue("site", siteId);
                    apply.Parameters.AddWithValue("maint", localFinishDate); apply.Parameters.AddWithValue("actor", user.UserId); apply.Parameters.AddWithValue("device", deviceId);
                    await apply.ExecuteNonQueryAsync(cancellationToken);
                }
                await using (var replace = new NpgsqlCommand("""
                    DELETE FROM activity_devices WHERE activity_id = @id;
                    INSERT INTO activity_devices (activity_id, device_id, role, before_status_id, after_status_id, before_unit_id, after_unit_id,
                        before_location_site_id, after_location_site_id, before_last_maintenance_date, after_last_maintenance_date)
                    VALUES (@id, @device, 'subject', @bstatus, 1, @bunit, @unit, @bloc, @site, @bmaint, @maint)
                    """, connection, transaction))
                {
                    replace.Parameters.AddWithValue("id", id); replace.Parameters.AddWithValue("device", deviceId);
                    replace.Parameters.AddWithValue("bstatus", devStatus);
                    replace.Parameters.Add("bunit", NpgsqlDbType.Uuid).Value = (object?)devUnit ?? DBNull.Value;
                    replace.Parameters.AddWithValue("unit", unitId.Value); replace.Parameters.AddWithValue("site", siteId);
                    replace.Parameters.Add("bloc", NpgsqlDbType.Integer).Value = (object?)devLocation ?? DBNull.Value;
                    replace.Parameters.Add("bmaint", NpgsqlDbType.Date).Value = (object?)devMaintenance ?? DBNull.Value;
                    replace.Parameters.AddWithValue("maint", localFinishDate);
                    await replace.ExecuteNonQueryAsync(cancellationToken);
                }

                headerSets.AddRange(["unit_id = @m_unit", "started_at = @m_start", "finished_at = @m_finish",
                    "start_utc_offset_minutes = @m_so", "finish_utc_offset_minutes = @m_fo", "duration_minutes = @m_dur"]);
                header.Parameters.AddWithValue("m_unit", unitId.Value);
                header.Parameters.AddWithValue("m_start", newStartUtc); header.Parameters.AddWithValue("m_finish", newFinishUtc);
                header.Parameters.AddWithValue("m_so", (short)newStartOffset); header.Parameters.AddWithValue("m_fo", (short)newFinishOffset);
                header.Parameters.AddWithValue("m_dur", (int)(newFinishUtc - newStartUtc).TotalMinutes);
                if (equipmentUnitChanged) newUnitIdForDetails = unitId;

                // Device audit rows: state before the edit versus state after it.
                if (deviceId != oldDeviceId)
                {
                    auditRows.Add((oldDeviceId, current["deviceCode"]!, new { status = "in_use", unit_id = currentUnitId }, new { status = StatusCode(beforeStatus), unit_id = beforeUnit, form_number = formNumber }));
                    auditRows.Add((deviceId, deviceCode, new { status = StatusCode(devStatus), unit_id = devUnit }, new { status = "in_use", unit_id = unitId, form_number = formNumber }));
                }
                else if (unitId != currentUnitId || localFinishDate != DateOnly.FromDateTime(finishLocalCurrent))
                {
                    auditRows.Add((deviceId, deviceCode, new { status = "in_use", unit_id = currentUnitId }, new { status = "in_use", unit_id = unitId, form_number = formNumber }));
                }
            }

            foreach (var entry in changed.Where(entry => Fields.TryGetValue(entry.Key, out var field) && !field.IsDetail))
            {
                headerSets.Add($"{Fields[entry.Key].Column} = @{entry.Key}");
                header.Parameters.AddWithValue(entry.Key, entry.Value);
            }
            header.CommandText = $"UPDATE activities SET {string.Join(", ", headerSets)}{(headerSets.Count > 0 ? ", " : "")}updated_at = CURRENT_TIMESTAMP, updated_by = @actor WHERE activity_id = @id RETURNING row_version";
            var newVersion = (long)(await header.ExecuteScalarAsync(cancellationToken))!;
            await header.DisposeAsync();

            var detailChanges = changed.Where(entry => Fields.TryGetValue(entry.Key, out var field) && field.IsDetail).ToArray();
            if (detailChanges.Length > 0)
            {
                var detailSet = string.Join(", ", detailChanges.Select(entry => $"{Fields[entry.Key].Column} = @{entry.Key}"));
                await using var detail = new NpgsqlCommand($"UPDATE installation_details SET {detailSet} WHERE activity_id = @id", connection, transaction);
                detail.Parameters.AddWithValue("id", id);
                foreach (var entry in detailChanges) detail.Parameters.AddWithValue(entry.Key, entry.Value);
                await detail.ExecuteNonQueryAsync(cancellationToken);
            }
            if (newUnitIdForDetails is not null)
            {
                await using var equipment = new NpgsqlCommand("""
                    UPDATE installation_details SET equipment_type_id = fu.equipment_type_id, egi = fu.egi
                    FROM fleet_units fu WHERE installation_details.activity_id = @id AND fu.unit_id = @unit
                    """, connection, transaction);
                equipment.Parameters.AddWithValue("id", id); equipment.Parameters.AddWithValue("unit", newUnitIdForDetails.Value);
                await equipment.ExecuteNonQueryAsync(cancellationToken);
            }

            var group = Guid.NewGuid();
            var before = changed.ToDictionary(entry => entry.Key, entry => current[entry.Key]);
            var after = changed.ToDictionary(entry => entry.Key, entry => (string?)entry.Value);
            async Task WriteAuditAsync(string table, string recordId, Guid entityId, int site, object old, object next)
            {
                await using var audit = new NpgsqlCommand("""
                    INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation,
                        old_values, new_values, change_group_id, request_id, action)
                    VALUES (@actor, @name, @site, @table, @record, @entity, 'UPDATE', @before, @after, @group, @request_id, 'transaction_update')
                    """, connection, transaction);
                audit.Parameters.AddWithValue("actor", user.UserId); audit.Parameters.AddWithValue("name", user.Name);
                audit.Parameters.AddWithValue("site", site); audit.Parameters.AddWithValue("table", table);
                audit.Parameters.AddWithValue("record", recordId); audit.Parameters.AddWithValue("entity", entityId);
                audit.Parameters.AddWithValue("before", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(old));
                audit.Parameters.AddWithValue("after", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(next));
                audit.Parameters.AddWithValue("group", group); audit.Parameters.AddWithValue("request_id", requestId);
                await audit.ExecuteNonQueryAsync(cancellationToken);
            }
            await WriteAuditAsync("installation", formNumber, id, siteId, before, after);
            foreach (var row in auditRows) await WriteAuditAsync("device", row.Code, row.DeviceId, siteId, row.Old, row.New);
            commitStarted = true;
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { activityId = id, rowVersion = $"0x{newVersion:x16}" });
        }
        catch (PostgresException error) when (error.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            app.Logger.LogWarning("Installation edit conflict, constraint {Constraint}, request {RequestId}.", error.ConstraintName, requestId);
            return Error(409, "CONFLICT", "A concurrent operation conflicts with this edit.");
        }
        catch (PostgresException error)
        {
            app.Logger.LogError("Installation edit rejected, SQL state {SqlState}, constraint {Constraint}, request {RequestId}.", error.SqlState, error.ConstraintName, requestId);
            return Error(422, "DATABASE_CONSTRAINT", "Database rejected the edit.");
        }
        catch (NpgsqlException)
        {
            return commitStarted
                ? Error(503, "COMMIT_OUTCOME_UNKNOWN", "The outcome could not be confirmed. Reload before retrying.")
                : Error(503, "DATABASE_UNAVAILABLE", "Database unavailable.");
        }
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}
