import { buildServer } from '@/buildServer';

describe('options-automator webhook', function() {
    let fatify;
    beforeEach(async function () {
        fastify = await buildServer(false);
    });
  
    afterEach(function () {
      fastify.close();
    });

    it('correctly inserts options-automator webhook when stage starts', async function () {
        const response = await fastify.inject({
          method: 'POST',
          url: '/metrics/options-automator/webhook',
          payload: ,
        });
    
        expect(response.statusCode).toBe(200);
    
        // TODO (mattgauntseo-sentry): Check metric is stored correctly in
        // database
      });
});
