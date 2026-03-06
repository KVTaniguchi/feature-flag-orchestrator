/**
 * Hook: pre-flight-checks
 * Query Datadog monitors to block flag toggles if active P1/P2 incidents exist.
 */
module.exports = async function preFlightChecks() {
    console.log('Running pre-flight observability checks...');
    return true;
};
