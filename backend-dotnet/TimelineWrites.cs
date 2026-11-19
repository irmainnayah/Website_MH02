using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;
using Npgsql;
using NpgsqlTypes;

public static class TimelineWrites
{
    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapPost("/api/timeline", (HttpContext context, CancellationToken ct) => WriteAsync(app, getConnectionString, context, context.Request.Query["deviceCode"].ToString(), null, false, false, ct));
        app.MapPost("/api/timeline/{deviceCode}", (HttpContext context, string deviceCode, CancellationToken ct) => WriteAsync(app, getConnectionString, context, deviceCode, null, false, false, ct));
        app.MapPatch("/api/timeline/{deviceCode}/activities/{id:guid}", (HttpContext context, string deviceCode, Guid id, CancellationToken ct) => WriteAsync(app, getConnectionString, context, deviceCode, id, false, false, ct));
        app.MapDelete("/api/timeline/{deviceCode}/activities/{id:guid}", (HttpContext context, string deviceCode, Guid id, CancellationToken ct) => WriteAsync(app, getConnectionString, context, deviceCode, id, true, false, ct));
        app.MapMethods("/api/timeline/{deviceCode}/events/{eventId:guid}", ["PATCH", "DELETE"],
            (HttpContext context, string deviceCode, Guid eventId, CancellationToken ct) => WriteAsync(app, getConnectionString, context, deviceCode, eventId, false, true, ct));
    }

    private static async Task<IResult> WriteAsync(WebApplication app, Func<string> getConnectionString, HttpContext context, string deviceCode, Guid? id, bool delete, bool immutableEvent, CancellationToken ct)
    {
        var token = context.Request.Cookies["mh02_session"];
        if (string.IsNullOrEmpty(token) || token.Length > 128) return ActivityLogEndpoints.Error(401, "UNAUTHENTICATED", "Authentication required.");
        if (!AuthEndpoints.HasAllowedOrigin(context)) return ActivityLogEndpoints.Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
        if (string.IsNullOrWhiteSpace(deviceCode) || deviceCode.Length > 40) return ActivityLogEndpoints.Error(400, "DEVICE_REQUIRED", "Provide the Device code from the timeline.");
        var type = context.Request.Query["activityType"].ToString();
        try
        {
            await using (var connection = new NpgsqlConnection(getConnectionString()))
            {
                await connection.OpenAsync(ct);
                var user = await SessionStore.FindUserAsync(connection, token, ct);
                if (user is null) return ActivityLogEndpoints.Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, null, out var site)) return ActivityLogEndpoints.Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");
                await using var device = new NpgsqlCommand("SELECT device_id, is_deleted FROM devices WHERE device_code = @code AND (@site IS NULL OR site_id = @site) AND (@admin OR NOT is_deleted)", connection);
                device.Parameters.AddWithValue("code", deviceCode); device.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                device.Parameters.AddWithValue("admin", user.Role == "superadmin");
                Guid deviceId;
                bool archived;
                await using (var reader = await device.ExecuteReaderAsync(ct))
                {
                    if (!await reader.ReadAsync(ct)) return ActivityLogEndpoints.Error(404, "NOT_FOUND", "Device not found.");
                    deviceId = reader.GetGuid(0); archived = reader.GetBoolean(1);
                }
                if (immutableEvent) return ActivityLogEndpoints.Error(405, "HISTORY_IMMUTABLE", "Lifecycle events are append-only and cannot be edited or deleted.");
                if (archived) return ActivityLogEndpoints.Error(409, "DEVICE_ARCHIVED", "The Device is archived.");
                if (id is null)
                {
                    if (!ActivityLogEndpoints.Types.Contains(type)) return ActivityLogEndpoints.Error(400, "ACTIVITY_TYPE_REQUIRED", "Provide a supported activityType in the query.");
                }
                else
                {
                    if (user.Role != "superadmin") return ActivityLogEndpoints.Error(403, "SUPERADMIN_ONLY", "Only a Superadmin can update or delete an activity.");
                    await using var activity = new NpgsqlCommand("SELECT a.activity_type FROM activity_devices ad JOIN activities a ON a.activity_id = ad.activity_id WHERE ad.device_id = @device AND a.activity_id = @id AND (@site IS NULL OR a.site_id = @site)", connection);
                    activity.Parameters.AddWithValue("device", deviceId); activity.Parameters.AddWithValue("id", id.Value);
                    activity.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                    if (await activity.ExecuteScalarAsync(ct) is not string activityType) return ActivityLogEndpoints.Error(404, "NOT_FOUND", "Activity not found on this Device timeline.");
                    type = activityType;
                }
            }
            if (!delete)
            {
                var bindingError = await ValidateDeviceBindingAsync(context, deviceCode, type, id is null, ct);
                if (bindingError is not null) return bindingError;
            }
            return await ActivityLogWrites.DispatchAsync(app, getConnectionString, context, id, delete, ct);
        }
        catch (NpgsqlException) { return ActivityLogEndpoints.Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        catch (JsonException) { return ActivityLogEndpoints.Error(400, "INVALID_JSON", "The payload must be valid JSON."); }
        catch (InvalidDataException) { return ActivityLogEndpoints.Error(400, "INVALID_MULTIPART", "The multipart body could not be read."); }
        catch (BadHttpRequestException error) when (error.StatusCode == 413) { return ActivityLogEndpoints.Error(413, "REQUEST_TOO_LARGE", "The request is too large."); }
        catch (IOException) { return ActivityLogEndpoints.Error(413, "REQUEST_TOO_LARGE", "The request could not be buffered within the allowed limit."); }
    }

    private static async Task<IResult?> ValidateDeviceBindingAsync(HttpContext context, string code, string type, bool create, CancellationToken ct)
    {
        var maxBytes = type is "removal" or "troubleshoot" ? 11L * 1024 * 1024 : 41L * 1024 * 1024;
        if (context.Request.ContentLength > maxBytes) return ActivityLogEndpoints.Error(413, "REQUEST_TOO_LARGE", "The request is too large.");
        var feature = context.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (feature is { IsReadOnly: false }) feature.MaxRequestBodySize = maxBytes;
        JsonDocument document;
        if (context.Request.HasFormContentType)
        {
            var form = await context.Request.ReadFormAsync(ct);
            if (form["payload"].Count != 1) return ActivityLogEndpoints.Error(400, "PAYLOAD_REQUIRED", "One payload field is required.");
            document = JsonDocument.Parse(form["payload"].ToString());
        }
        else if (context.Request.HasJsonContentType())
        {
            context.Request.EnableBuffering(64 * 1024, maxBytes);
            try { document = await JsonDocument.ParseAsync(context.Request.Body, cancellationToken: ct); }
            finally { context.Request.Body.Position = 0; }
        }
        else return ActivityLogEndpoints.Error(415, "UNSUPPORTED_MEDIA_TYPE", "Use the content type required by the source transaction.");
        using (document)
        {
            if (document.RootElement.ValueKind != JsonValueKind.Object) return ActivityLogEndpoints.Error(400, "INVALID_JSON", "The payload must be an object.");
            var names = type == "replacement" ? new[] { "oldDeviceCode", "newDeviceCode" } : new[] { "deviceCode" };
            var supplied = new List<string>();
            foreach (var name in names)
            {
                if (!document.RootElement.TryGetProperty(name, out var value)) continue;
                if (value.ValueKind != JsonValueKind.String) return ActivityLogEndpoints.Error(400, "DEVICE_MISMATCH", "Device fields must contain Device codes.");
                supplied.Add(value.GetString()!.Trim());
            }
            if ((create || supplied.Count > 0) && !supplied.Contains(code, StringComparer.Ordinal))
                return ActivityLogEndpoints.Error(422, "DEVICE_MISMATCH", "The transaction must involve the Device shown on this timeline.");
        }
        return null;
    }
}