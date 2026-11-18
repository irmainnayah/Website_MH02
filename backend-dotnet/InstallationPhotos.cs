using System.Security.Cryptography;
using Npgsql;
using NpgsqlTypes;

public static class InstallationPhotos
{
    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapGet("/api/photos/{id:guid}", async (HttpContext context, Guid id, CancellationToken cancellationToken) =>
        {
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128)
                return Error(401, "UNAUTHENTICATED", "Authentication required.");
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, null, out var site)) return Error(403, "NO_SITE_ASSIGNED", "Your account has no valid role or Site assigned.");
                await using var command = new NpgsqlCommand("""
                    SELECT p.storage_path, p.mime_type, p.size_bytes, p.sha256, p.storage_provider
                    FROM transaction_photos p JOIN activities a ON a.activity_id = p.activity_id
                    WHERE p.photo_id = @id AND a.activity_type IN ('installation', 'replacement', 'removal') AND (@site IS NULL OR a.site_id = @site)
                    """, connection);
                command.Parameters.AddWithValue("id", id);
                command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                string path, mime, hash;
                long size;
                await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
                {
                    if (!await reader.ReadAsync(cancellationToken)) return Error(404, "NOT_FOUND", "Photo not found.");
                    if (reader.GetString(4) != "local_fs") return Error(503, "PHOTO_UNAVAILABLE", "Photo unavailable.");
                    path = reader.GetString(0); mime = reader.GetString(1); size = reader.GetInt64(2); hash = reader.GetString(3).Trim();
                }
                if (mime is not ("image/jpeg" or "image/png" or "image/webp") || size is < 1 or > InstallationUploads.MaxPhotoBytes)
                    return Error(503, "PHOTO_UNAVAILABLE", "Photo unavailable.");
                var fullPath = InstallationUploads.ResolvePath(InstallationUploads.StorageRoot(app), path);
                var info = new FileInfo(fullPath);
                if (!info.Exists || info.Length != size) return Error(503, "PHOTO_UNAVAILABLE", "Photo unavailable.");
                var bytes = await File.ReadAllBytesAsync(fullPath, cancellationToken);
                if (bytes.LongLength != size || !CryptographicOperations.FixedTimeEquals(SHA256.HashData(bytes), Convert.FromHexString(hash)))
                    return Error(503, "PHOTO_UNAVAILABLE", "Photo unavailable.");
                return Results.File(bytes, mime);
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
            catch (IOException) { return Error(503, "PHOTO_UNAVAILABLE", "Photo unavailable."); }
            catch (UnauthorizedAccessException) { return Error(503, "PHOTO_UNAVAILABLE", "Photo unavailable."); }
            catch (FormatException) { return Error(503, "PHOTO_UNAVAILABLE", "Photo unavailable."); }
        });
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}