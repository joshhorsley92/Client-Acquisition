// Jest setup — runs before each test file. Disables background side effects
// that would otherwise spawn external processes or hit the network.
process.env.DISABLE_AUTO_ENRICHMENT = '1';
