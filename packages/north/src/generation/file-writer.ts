import { randomBytes } from "node:crypto";
import { chmod, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// ============================================================================
// Error Types
// ============================================================================

export class FileWriteError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "FileWriteError";
  }
}

// ============================================================================
// Atomic File Writer
// ============================================================================

/**
 * Generate a temporary file path in the same directory as target
 * (avoids cross-filesystem rename issues)
 */
function getTempFilePath(targetPath: string): string {
  const dir = dirname(targetPath);
  const randomSuffix = randomBytes(8).toString("hex");
  return join(dir, `.north-tmp-${randomSuffix}`);
}

/**
 * Ensure directory exists, creating it if necessary
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new FileWriteError(
      `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`,
      dirPath,
      error
    );
  }
}

/**
 * Get file permissions, or undefined if file doesn't exist
 */
async function getFilePermissions(filePath: string): Promise<number | undefined> {
  try {
    const stats = await stat(filePath);
    return stats.mode;
  } catch (error) {
    // File doesn't exist
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

/**
 * Write file atomically using temp file + rename
 * Preserves file permissions if file exists
 */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  // Ensure directory exists
  const dir = dirname(filePath);
  await ensureDirectoryExists(dir);

  // Get existing file permissions
  const existingMode = await getFilePermissions(filePath);

  // Generate temp file path in same directory
  const tempPath = getTempFilePath(filePath);

  try {
    // Write to temp file
    await writeFile(tempPath, content, "utf-8");

    // Preserve permissions if file exists
    if (existingMode !== undefined) {
      await chmod(tempPath, existingMode);
    }

    // Atomic rename
    await rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }

    throw new FileWriteError(
      `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
      filePath,
      error
    );
  }
}

/**
 * Write multiple files atomically
 * If any write fails, attempts to clean up temp files
 */
export async function writeFilesAtomic(
  files: Array<{ path: string; content: string }>
): Promise<void> {
  const tempFiles: string[] = [];

  try {
    // Write all files to temp locations
    for (const file of files) {
      const dir = dirname(file.path);
      await ensureDirectoryExists(dir);

      const tempPath = getTempFilePath(file.path);
      tempFiles.push(tempPath);

      await writeFile(tempPath, file.content, "utf-8");
    }

    // Atomic rename all at once
    for (let i = 0; i < files.length; i++) {
      const tempPath = tempFiles[i];
      const targetPath = files[i]?.path;
      if (tempPath && targetPath) {
        await rename(tempPath, targetPath);
      }
    }
  } catch (error) {
    // Clean up temp files on error
    for (const tempPath of tempFiles) {
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    throw new FileWriteError(
      `Failed to write files: ${error instanceof Error ? error.message : String(error)}`,
      files[0]?.path ?? "unknown",
      error
    );
  }
}
