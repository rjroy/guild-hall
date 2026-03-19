import { describe, expect, it } from "bun:test";
import { formatFileSize, formatLabel } from "@/web/components/artifact/ImageMetadataSidebar";

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(102400)).toBe("100.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(1048576)).toBe("1.0 MB");
    expect(formatFileSize(5242880)).toBe("5.0 MB");
  });
});

describe("formatLabel", () => {
  it("maps known MIME types to labels", () => {
    expect(formatLabel("image/png")).toBe("PNG");
    expect(formatLabel("image/jpeg")).toBe("JPEG");
    expect(formatLabel("image/webp")).toBe("WebP");
    expect(formatLabel("image/gif")).toBe("GIF");
    expect(formatLabel("image/svg+xml")).toBe("SVG");
  });

  it("returns raw MIME type for unknown types", () => {
    expect(formatLabel("image/tiff")).toBe("image/tiff");
  });
});
