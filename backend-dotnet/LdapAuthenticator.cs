using System.DirectoryServices.Protocols;
using System.Net;

public enum LdapAuthenticationResult { Authenticated, InvalidCredentials, Unavailable }

public static class LdapAuthenticator
{
    public static async Task<LdapAuthenticationResult> AuthenticateAsync(
        IConfiguration configuration, string username, string password, ILogger logger, CancellationToken cancellationToken)
    {
        var host = configuration["Ldap:Host"];
        var domain = configuration["Ldap:UserPrincipalDomain"];
        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(domain) ||
            Uri.CheckHostName(domain) != UriHostNameType.Dns ||
            !int.TryParse(configuration["Ldap:Port"], out var port) || port is < 1 or > 65535)
        {
            logger.LogWarning("LDAP authentication configuration is incomplete or invalid.");
            return LdapAuthenticationResult.Unavailable;
        }

        return await Task.Run(() =>
        {
            try
            {
                using var connection = new LdapConnection(new LdapDirectoryIdentifier(host, port))
                {
                    AuthType = AuthType.Basic,
                    Timeout = TimeSpan.FromSeconds(8)
                };
                connection.SessionOptions.ProtocolVersion = 3;
                connection.SessionOptions.SecureSocketLayer = true;
                connection.Bind(new NetworkCredential($"{username}@{domain}", password));
                return LdapAuthenticationResult.Authenticated;
            }
            catch (LdapException error) when (error.ErrorCode == 49)
            {
                return LdapAuthenticationResult.InvalidCredentials;
            }
            catch (DirectoryOperationException error) when (error.Response?.ResultCode == (ResultCode)49)
            {
                return LdapAuthenticationResult.InvalidCredentials;
            }
            catch (LdapException error)
            {
                logger.LogWarning("LDAP authentication service unavailable. LDAP error code: {ErrorCode}.", error.ErrorCode);
                return LdapAuthenticationResult.Unavailable;
            }
            catch (DirectoryOperationException error)
            {
                logger.LogWarning("LDAP authentication service unavailable. LDAP result code: {ResultCode}.", error.Response?.ResultCode);
                return LdapAuthenticationResult.Unavailable;
            }
        }, cancellationToken);
    }
}