package com.runcrew.gps.model

import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicReference

/**
 * Represents the mutable state of an active running session.
 * Thread-safe: all collections are concurrent and state transitions are atomic.
 */
class RunSession {

    enum class State {
        IDLE,
        TRACKING,
        PAUSED,
        STOPPED
    }

    private val _state = AtomicReference(State.IDLE)
    val state: State get() = _state.get()

    private val _rawPoints = CopyOnWriteArrayList<GPSPoint>()
    val rawPoints: List<GPSPoint> get() = _rawPoints

    private val _filteredLocations = CopyOnWriteArrayList<FilteredLocation>()
    val filteredLocations: List<FilteredLocation> get() = _filteredLocations

    @Volatile
    var startTime: Long = 0L
        private set

    @Volatile
    var pauseTime: Long = 0L
        private set

    @Volatile
    var totalPauseDuration: Long = 0L
        private set

    @Volatile
    var totalDistance: Double = 0.0
        private set

    @Volatile
    var isMoving: Boolean = false

    @Volatile
    var lastStationaryTransitionTime: Long = 0L

    @Volatile
    var gpsStatus: String = "searching"

    fun start() {
        if (_state.compareAndSet(State.IDLE, State.TRACKING) ||
            _state.compareAndSet(State.STOPPED, State.TRACKING)
        ) {
            startTime = System.currentTimeMillis()
            pauseTime = 0L
            totalPauseDuration = 0L
            totalDistance = 0.0
            isMoving = false
            lastStationaryTransitionTime = 0L
            gpsStatus = "searching"
            _rawPoints.clear()
            _filteredLocations.clear()
        }
    }

    fun pause() {
        if (_state.compareAndSet(State.TRACKING, State.PAUSED)) {
            pauseTime = System.currentTimeMillis()
        }
    }

    fun resume() {
        if (_state.compareAndSet(State.PAUSED, State.TRACKING)) {
            if (pauseTime > 0) {
                totalPauseDuration += System.currentTimeMillis() - pauseTime
                pauseTime = 0L
            }
        }
    }

    fun stop() {
        val previousState = _state.getAndSet(State.STOPPED)
        if (previousState == State.PAUSED && pauseTime > 0) {
            totalPauseDuration += System.currentTimeMillis() - pauseTime
            pauseTime = 0L
        }
    }

    fun addRawPoint(point: GPSPoint) {
        _rawPoints.add(point)
    }

    fun addFilteredLocation(location: FilteredLocation) {
        _filteredLocations.add(location)
        totalDistance = location.cumulativeDistance
    }

    /**
     * Elapsed active running time in milliseconds (excludes paused duration).
     */
    fun getElapsedTime(): Long {
        if (startTime == 0L) return 0L
        val now = when (state) {
            State.PAUSED -> pauseTime
            State.STOPPED -> pauseTime.takeIf { it > 0 } ?: System.currentTimeMillis()
            else -> System.currentTimeMillis()
        }
        return now - startTime - totalPauseDuration
    }

    fun isActive(): Boolean {
        return state == State.TRACKING
    }
}
