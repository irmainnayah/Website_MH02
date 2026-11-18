using System.Security.Cryptography;
using System.Text;
using Npgsql;

public sealed record SessionUser(Guid UserId, string Nrp, string Name, string Role, int? SiteId);

public static class SessionStore
{
    public static bool TryScope(SessionUser user, int? requestedSite, out int? site)
    {
        site = null;
        if (user.Role == "superadmin") { site = requestedSite; return true; }
        if (user.Role != "user" || user.SiteId is null || (requestedSite is not null && requestedSite != user.SiteId)) return false;
        site = user.SiteId;
        return true;
    }

    public static string HashToken(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public static async Task<SessionUser?> FindUserAsync(
        NpgsqlConnection connection, string? token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(token) || token.Length > 128)
            return null;

        await using var command = new NpgsqlCommand("""
            SELECT u.user_id, u.nrp, u.name, r.role_code, u.site_id
            FROM auth_sessions s
            INNER JOIN users u ON u.user_id = s.user_id
            INNER JOIN roles r ON r.role_id = u.role_id
            WHERE s.token_hash = @hash AND s.revoked_at IS NULL AND s.mfa_verified_at IS NOT NULL
              AND s.expires_at > CURRENT_TIMESTAMP AND u.status = 'active'
            """, connection);
        command.Parameters.AddWithValue("hash", HashToken(token));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            return null;

        return new SessionUser(reader.GetGuid(0), reader.GetString(1), reader.GetString(2),
            reader.GetString(3), reader.IsDBNull(4) ? null : reader.GetInt32(4));
    }
}