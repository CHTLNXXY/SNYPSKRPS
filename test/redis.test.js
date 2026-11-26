// Same backend suite, but through the real @upstash/redis client against a local Upstash-protocol server.
process.env.SNYP_TEST_REDIS = '1';
require('./backend.test.js');
