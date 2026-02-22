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
            try jsonData.write(to: fileURL)
            print("[WatchRunStorage] Saved run: \(filename) (\(jsonData.count) bytes)")
        } catch {
            print("[WatchRunStorage] Failed to save run: \(error.localizedDescription)")
        }
    }

    /// Get all pending (unsynced) runs.
    func getPendingRuns() -> [[String: Any]] {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: storageDir,
            includingPropertiesForKeys: nil
        ) else { return [] }

        return files.compactMap { fileURL -> [String: Any]? in
            guard fileURL.pathExtension == "json" else { return nil }
            guard let data = try? Data(contentsOf: fileURL),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return nil }
            var result = json
            result["_filename"] = fileURL.lastPathComponent
            return result
        }
    }

    /// Remove a synced run.
    func removeRun(filename: String) {
        let fileURL = storageDir.appendingPathComponent(filename)
        try? FileManager.default.removeItem(at: fileURL)
        print("[WatchRunStorage] Removed synced run: \(filename)")
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
