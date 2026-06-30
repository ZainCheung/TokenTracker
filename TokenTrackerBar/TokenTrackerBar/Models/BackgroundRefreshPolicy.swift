import Foundation

/// Policy decision maker for background data refresh and full synchronization.
///
/// This policy helps to decouple lightweight local dashboard reloads (frequent)
/// from heavier remote token synchronization (less frequent), optimizing energy usage.
enum BackgroundRefreshPolicy {
    /// The default interval (in seconds) between lightweight local dashboard refreshes.
    static let defaultRefreshInterval: TimeInterval = 300
    /// The default interval (in seconds) between remote/full data synchronizations.
    static let defaultSyncInterval: TimeInterval = 300

    /// Determines whether a full synchronization should be run.
    ///
    /// - Parameters:
    ///   - now: The current date/time.
    ///   - lastSyncAt: The timestamp of the last successful full synchronization.
    ///   - syncInterval: The minimum interval required between synchronizations.
    /// - Returns: `true` if a full sync is needed, `false` otherwise.
    static func shouldRunSync(
        now: Date,
        lastSyncAt: Date?,
        syncInterval: TimeInterval = defaultSyncInterval
    ) -> Bool {
        guard syncInterval > 0 else { return false }
        guard let lastSyncAt else { return true }
        return now.timeIntervalSince(lastSyncAt) >= syncInterval
    }
}
