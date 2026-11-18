using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Features;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record TroubleshootInput(int? SiteId, string? DeviceCode, string? StartedAt, string? FinishedAt,
    string? ComponentType, string? Issue, string? ActionTaken, string? HealthCheckStatus, string? Remarks,
    string? RowVersion, string[]? KeepPhotoSlots, Dictionary<string, string>? PhotoCaptions);
public sealed record TroubleshootUploadRequest(TroubleshootInput Input, IReadOnlyList<InstallationUpload> Photos);

public static class TroubleshootUploads
{
    public static readonly string[] Slots = ["before_repair", "after_repair"];
    public const long MaxPhotoBytes = 5 * 1024 * 1024;
    public const long MaxRequestBytes = 11 * 1024 * 1024;

    public static async Task<TroubleshootUploadRequest> ReadAsync(HttpContext context, CancellationToken ct)
    {
        if (context.Request.ContentLength > MaxRequestBytes) throw new InstallationUploadException("REQUEST_TOO_LARGE", "Maximum request size is 11 MiB.", 413);
        var feature = context.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (feature is { IsReadOnly: false }) feature.MaxRequestBodySize = MaxRequestBytes;
        if (!context.Request.HasFormContentType || context.Request.ContentType?.StartsWith("multipart/form-data", StringComparison.OrdinalIgnoreCase) != true)
            throw new InstallationUploadException("UNSUPPORTED_MEDIA_TYPE", "Use multipart/form-data with a payload field.", 415);
        try
        {
            var form = await context.Request.ReadFormAsync(ct);
            if (form["payload"].Count != 1) throw new InstallationUploadException("PAYLOAD_REQUIRED", "One payload field is required.");
            var input = JsonSerializer.Deserialize<TroubleshootInput>(form["payload"].ToString(), new JsonSerializerOptions(JsonSerializerDefaults.Web))
                ?? throw new InstallationUploadException("INVALID_JSON", "The payload must be valid JSON.");
            var keep = input.KeepPhotoSlots ?? [];
            if (keep.Any(slot => !Slots.Contains(slot)) || keep.Distinct().Count() != keep.Length ||
                input.PhotoCaptions?.Any(entry => !keep.Contains(entry.Key) || entry.Value is null || entry.Value.Length > 200) == true)
                throw new InstallationUploadException("PHOTO_METADATA_INVALID", "Preserved slots and captions must be valid; captions have at most 200 characters.");
            var captions = new Dictionary<string, string>();
            foreach (var field in form)
            {
                if (field.Key == "payload") continue;
                if (!field.Key.StartsWith("caption:", StringComparison.Ordinal) || !Slots.Contains(field.Key[8..]) || field.Value.Count != 1 || field.Value.ToString().Length > 200)
                    throw new InstallationUploadException("UNKNOWN_FORM_FIELD", "Unknown field or invalid photo caption.");
                captions.Add(field.Key[8..], field.Value.ToString().Trim());
            }
            if (form.Files.Count > Slots.Length) throw new InstallationUploadException("TOO_MANY_PHOTOS", "Troubleshoot accepts two photo slots.");
            var photos = new List<InstallationUpload>();
            var seen = new HashSet<string>();
            foreach (var file in form.Files)
            {
                if (!file.Name.StartsWith("photo:", StringComparison.Ordinal) || !Slots.Contains(file.Name[6..]))
                    throw new InstallationUploadException("PHOTO_SLOT_INVALID", "Unknown troubleshoot photo slot.");
                var slot = file.Name[6..];
                if (!seen.Add(slot) || keep.Contains(slot)) throw new InstallationUploadException("PHOTO_SLOT_DUPLICATE", "A slot cannot be uploaded twice or preserved and replaced together.");
                if (file.Length < 1 || file.Length > MaxPhotoBytes) throw new InstallationUploadException("PHOTO_SIZE_INVALID", "Photos must be nonempty and at most 5 MiB.");
                await using var memory = new MemoryStream((int)file.Length);
                await file.CopyToAsync(memory, ct);
                var bytes = memory.ToArray();
                var type = InstallationUploads.DetectType(bytes) ?? throw new InstallationUploadException("PHOTO_TYPE_INVALID", "Photos must be JPEG, PNG or WebP.");
                var filename = Path.GetFileName(file.FileName.Replace('\\', '/').Replace("\0", "_"));
                if (filename.Length > 255) filename = filename[..255];
                photos.Add(new InstallationUpload(slot, captions.GetValueOrDefault(slot), filename, type.Mime, type.Extension, bytes, Convert.ToHexStringLower(SHA256.HashData(bytes))));
            }
            if (captions.Keys.Any(slot => !seen.Contains(slot))) throw new InstallationUploadException("CAPTION_WITHOUT_PHOTO", "Upload captions require a photo in the same slot.");
            return new TroubleshootUploadRequest(input, photos.OrderBy(photo => photo.Slot, StringComparer.Ordinal).ToArray());
        }
        catch (JsonException) { throw new InstallationUploadException("INVALID_JSON", "The payload must be valid JSON."); }
        catch (InvalidDataException) { throw new InstallationUploadException("INVALID_MULTIPART", "The multipart body could not be read."); }
    }
}