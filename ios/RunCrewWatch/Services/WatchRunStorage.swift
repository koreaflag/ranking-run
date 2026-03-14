import Foundation

/// Simple file-based storage for standalone run data on the watch.
/// Stores completed runs as JSON files until they are synced to the phone.
class WatchRunStorage {
    static let shared = WatchRunStorage()

    private let storageDir: URL

    private init() {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        storageDir = docs.appendingPathComponent("pending_runs", isDirectory: true)
        try? FileManager.default.createDirectory(at: storageDir, withIntermediateDirectories: true)
    }

    /// Save a completed run for later sync.
    func saveRun(_ data: [String: Any]) {
        let filename = "run_\(Int(Date().timeIntervalSince1970)).json"
        let fileURL = storageDir.appendingPathComponent(filename)

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: data, options: [])
            try jsonData.write(to: fileURL, options: .atomic)
            print("[WatchRunStorage] Saved run: \(filename) (\(jsonData.count) bytes)")
        } catch let error as NSError {
            print("[WatchRunStorage] Failed to save run: \(error.localizedDescription) (code=\(error.code))")
            // If disk is full (NSFileWriteOutOfSpaceError = 640), try to clean up old corrupt files
            if error.code == 640 || error.domain == NSCocoaErrorDomain {
                cleanupCorruptFiles()
            }
        }
    }

    /// Get all pending (unsynced) runs.
    func getPendingRuns() -> [[String: Any]] {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: storageDir,
            includingPropertiesForKeys: [.fileSizeKey, .creationDateKey]
        ) else { return [] }

        var results: [[String: Any]] = []

        for fileURL in files {
            guard fileURL.pathExtension == "json" else { continue }

            do {
                let data = try Data(contentsOf: fileURL)
                guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    // Valid JSON but not a dictionary — corrupt, remove it
                    print("[WatchRunStorage] Removing non-dict JSON: \(fileURL.lastPathComponent)")
                    try? FileManager.default.removeItem(at: fileURL)
                    continue
                }
                var result = json
                result["_filename"] = fileURL.lastPathComponent
                results.append(result)
            } catch {
                // Corrupt file — remove it so it doesn't accumulate
                print("[WatchRunStorage] Removing corrupt file: \(fileURL.lastPathComponent) error=\(error.localizedDescription)")
                try? FileManager.default.removeItem(at: fileURL)
            }
        }

        return results
    }

    /// Remove corrupt or unreadable files from storage.
    private func cleanupCorruptFiles() {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: storageDir,
            includingPropertiesForKeys: nil
        ) else { return }

        for fileURL in files {
            guard fileURL.pathExtension == "json" else { continue }
            if let data = try? Data(contentsOf: fileURL),
               (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] != nil {
                continue  // Valid file
            }
            // Corrupt or unreadable — remove
            try? FileManager.default.removeItem(at: fileURL)
            print("[WatchRunStorage] Cleaned up corrupt file: \(fileURL.lastPathComponent)")
        }
    }

    /// Remove a synced run.
    func removeRun(filename: String) {
        let fileURL = storageDir.appendingPathComponent(filename)
        try? FileManager.default.removeItem(at: fileURL)
        print("[WatchRunStorage] Removed synced run: \(filename)")
    }

    /// Mark a run file as synced by renaming to .synced extension.
    /// The file is kept as a safety net until the OS transfer queue is confirmed empty.
    func markAsSynced(filename: String) {
        let sourceURL = storageDir.appendingPathComponent(filename)
        let destURL = storageDir.appendingPathComponent(filename + ".synced")
        do {
            try FileManager.default.moveItem(at: sourceURL, to: destURL)
            print("[WatchRunStorage] Marked as synced: \(filename)")
        } catch {
            // If rename fails (already moved, etc.), try removing
            try? FileManager.default.removeItem(at: sourceURL)
            print("[WatchRunStorage] markAsSynced fallback remove: \(filename)")
        }
    }

    /// Remove all .synced files. Called only when the OS transfer queue is empty,
    /// confirming all transfers were delivered successfully.
    func cleanupSyncedFiles() {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: storageDir,
            includingPropertiesForKeys: nil
        ) else { return }

        var cleaned = 0
        for fileURL in files {
            if fileURL.pathExtension == "synced" {
                try? FileManager.default.removeItem(at: fileURL)
                cleaned += 1
            }
        }
        if cleaned > 0 {
            print("[WatchRunStorage] Cleaned up \(cleaned) confirmed synced file(s)")
        }
    }

    /// Number of pending runs.
    var pendingCount: Int {
        let files = try? FileManager.default.contentsOfDirectory(
            at: storageDir,
            includingPropertiesForKeys: nil
        )
        return files?.filter { $0.pathExtension == "json" }.count ?? 0
    }
}
