using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;

public sealed record InstallationUpload(string Slot, string? Caption, string FileName, string MimeType, string Extension, byte[] Bytes, string Sha256);
public sealed record InstallationUploadRequest(CreateInstallationRequest Input, IReadOnlyList<InstallationUpload> Photos);

public sealed class InstallationUploadException(string code, string message, int status = 400) : Exception(message)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
}

public static class InstallationUploads
{
    public const long MaxPhotoBytes = 10 * 1024 * 1024;
    private const long MaxRequestBytes = 41 * 1024 * 1024;
    private static readonly HashSet<string> Slots = new(StringComparer.Ordinal)
    {
        "mh02_installed", "camera_dashboard_angle", "nodered_config", "gps_antenna"
    };
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static async Task<InstallationUploadRequest> ReadAsync(HttpContext context, CancellationToken cancellationToken)
    {
        if (context.Request.ContentLength > MaxRequestBytes)
            throw new InstallationUploadException("REQUEST_TOO_LARGE", "The request is too large.", 413);
        var feature = context.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (feature is { IsReadOnly: false }) feature.MaxRequestBodySize = MaxRequestBytes;

        try
        {
            if (!context.Request.HasFormContentType)
            {
                if (!context.Request.HasJsonContentType())
                    throw new InstallationUploadException("UNSUPPORTED_MEDIA_TYPE", "Use JSON or multipart/form-data.", 415);
                var input = await JsonSerializer.DeserializeAsync<CreateInstallationRequest>(context.Request.Body, JsonOptions, cancellationToken);
                return new InstallationUploadRequest(input ?? throw new InstallationUploadException("INVALID_JSON", "The request body must be valid JSON."), []);
            }
            if (!context.Request.ContentType!.StartsWith("multipart/form-data", StringComparison.OrdinalIgnoreCase))
                throw new InstallationUploadException("UNSUPPORTED_MEDIA_TYPE", "Use JSON or multipart/form-data.", 415);

            var form = await context.Request.ReadFormAsync(cancellationToken);
            if (form["payload"].Count != 1)
                throw new InstallationUploadException("PAYLOAD_REQUIRED", "One payload field is required.");
            var inputPayload = JsonSerializer.Deserialize<CreateInstallationRequest>(form["payload"].ToString(), JsonOptions)
                ?? throw new InstallationUploadException("INVALID_JSON", "The payload must be valid JSON.");
            var captions = new Dictionary<string, string?>(StringComparer.Ordinal);
            foreach (var field in form)
            {
                if (field.Key == "payload") continue;
                if (!field.Key.StartsWith("caption:", StringComparison.Ordinal) || !Slots.Contains(field.Key[8..]) || field.Value.Count != 1)
                    throw new InstallationUploadException("UNKNOWN_FORM_FIELD", "The form contains an unexpected field.");
                var caption = field.Value.ToString().Trim();
                if (caption.Length > 200) throw new InstallationUploadException("PHOTO_CAPTION_TOO_LONG", "A photo caption has at most 200 characters.");
                captions.Add(field.Key[8..], caption.Length == 0 ? null : caption);
            }
            if (form.Files.Count > Slots.Count) throw new InstallationUploadException("TOO_MANY_PHOTOS", "Too many photos were provided.");
            var photos = new List<InstallationUpload>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var file in form.Files)
            {
                if (!file.Name.StartsWith("photo:", StringComparison.Ordinal) || !Slots.Contains(file.Name[6..]))
                    throw new InstallationUploadException("PHOTO_SLOT_INVALID", "The photo slot is not valid.");
                var slot = file.Name[6..];
                if (!seen.Add(slot)) throw new InstallationUploadException("PHOTO_SLOT_DUPLICATE", "A photo slot was sent more than once.");
                if (file.Length < 1 || file.Length > MaxPhotoBytes)
                    throw new InstallationUploadException("PHOTO_SIZE_INVALID", "Photos must be nonempty and at most 10 MB.");
                await using var memory = new MemoryStream((int)file.Length);
                await file.CopyToAsync(memory, cancellationToken);
                var bytes = memory.ToArray();
                var type = DetectType(bytes);
                if (type is null) throw new InstallationUploadException("PHOTO_TYPE_INVALID", "Photos must be JPEG, PNG or WebP.");
                var filename = Path.GetFileName(file.FileName.Replace('\\', '/').Replace("\0", "_"));
                if (filename.Length > 255) filename = filename[..255];
                photos.Add(new InstallationUpload(slot, captions.GetValueOrDefault(slot), filename, type.Value.Mime, type.Value.Extension,
                    bytes, Convert.ToHexStringLower(SHA256.HashData(bytes))));
            }
            if (captions.Keys.Any(slot => !seen.Contains(slot)))
                throw new InstallationUploadException("CAPTION_WITHOUT_PHOTO", "A caption was provided without its photo.");
            return new InstallationUploadRequest(inputPayload, photos.OrderBy(photo => photo.Slot, StringComparer.Ordinal).ToArray());
        }
        catch (JsonException) { throw new InstallationUploadException("INVALID_JSON", "The request body must be valid JSON."); }
        catch (InvalidDataException) { throw new InstallationUploadException("INVALID_MULTIPART", "The multipart body could not be read."); }
    }

    public static string StorageRoot(WebApplication app)
    {
        var configured = app.Configuration["PHOTO_STORAGE_ROOT"];
        return Path.GetFullPath(string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(app.Environment.ContentRootPath, "..", ".storage") : configured);
    }

    public static string ResolvePath(string root, string relative)
    {
        if (string.IsNullOrWhiteSpace(relative) || Path.IsPathRooted(relative) || relative.Contains(':') || relative.Contains("..", StringComparison.Ordinal))
            throw new IOException("Invalid photo path.");
        var basePath = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var fullPath = Path.GetFullPath(Path.Combine(basePath, relative.Replace('/', Path.DirectorySeparatorChar)));
        if (!fullPath.StartsWith(basePath, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
            throw new IOException("Invalid photo path.");
        return fullPath;
    }

    public static (string Mime, string Extension)? DetectType(byte[] bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff) return ("image/jpeg", "jpg");
        if (bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) return ("image/png", "png");
        if (bytes.Length >= 12 && bytes.AsSpan(0, 4).SequenceEqual("RIFF"u8) && bytes.AsSpan(8, 4).SequenceEqual("WEBP"u8)) return ("image/webp", "webp");
        return null;
    }
}