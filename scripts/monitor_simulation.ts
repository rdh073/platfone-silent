// --- MOCK METRICS ENGINE ---

interface Metrics {
    balance: number;
    activeActivations: number;
    webhookErrors: number;
    uptimeSeconds: number;
}

class SimulationMonitor {
    private metrics: Metrics = {
        balance: 0.00, // Simulating the current blocked state
        activeActivations: 0,
        webhookErrors: 0,
        uptimeSeconds: 0
    };

    private running = true;

    async start() {
        console.log('📡 [Monitor] Starting System Observability Simulation...');
        console.log('   (Press Ctrl+C to stop)');

        // Log header
        console.log('TIME | BALANCE | ACTIVE | ERRORS | STATUS');
        console.log('-----|---------|--------|--------|-------');

        // Loop
        while (this.running) {
            await this.tick();
            await new Promise(r => setTimeout(r, 2000)); // 2s Tick
        }
    }

    private async tick() {
        this.metrics.uptimeSeconds += 2;

        // Simulating Metrics Fluctuation
        // In simulation mode, balance stays 0.00
        // We might simulate a transient error occasionally

        if (this.metrics.uptimeSeconds % 20 === 0) {
            // Every 20s, simulate a transient glitch resolved
            this.metrics.webhookErrors = Math.floor(Math.random() * 2);
        } else {
            this.metrics.webhookErrors = 0;
        }

        this.logMetrics();
    }

    private logMetrics() {
        // Safe time extraction
        const now = new Date().toISOString();
        const parts = now.split('T');
        const time = (parts.length > 1 && parts[1]) ? parts[1].split('.')[0] : "UNKNOWN";

        const status = this.metrics.balance < 1.00 ? '🔴 BLOCKED' : '🟢 OK';

        console.log(`${time} | $${this.metrics.balance.toFixed(2)} | ${this.metrics.activeActivations}      | ${this.metrics.webhookErrors}      | ${status}`);
    }

    stop() {
        this.running = false;
        console.log('\n🛑 [Monitor] Simulation Stopped.');
    }
}

// Handler for Ctrl+C
const monitor = new SimulationMonitor();

// Quick hack to avoid "process not found" if @types/node is acting up in ts-node
// We'll trust that we are running in Node context.
declare var process: any;

process.on('SIGINT', () => {
    monitor.stop();
    process.exit(0);
});

monitor.start().catch(console.error);
