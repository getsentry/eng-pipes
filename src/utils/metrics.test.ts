import { calculateSLOViolation } from './metrics';

describe('metrics tests', function () {
  describe('calculateSLOViolation', function () {
    describe('untriaged label is added', function () {
      it('should calculate SLO violation for Monday', function () {
        const timestamp = '2022-11-14T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(1);
        const result = calculateSLOViolation(
          'Status: Untriaged',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-16T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(3);
      });

      it('should calculate SLO violation for Tuesday', function () {
        const timestamp = '2022-11-15T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(2);
        const result = calculateSLOViolation(
          'Status: Untriaged',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-17T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(4);
      });

      it('should calculate SLO violation for Wednesday', function () {
        const timestamp = '2022-11-16T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(3);
        const result = calculateSLOViolation(
          'Status: Untriaged',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-18T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(5);
      });

      it('should calculate SLO violation for Thursday', function () {
        // This is a Thursday
        const timestamp = '2022-11-17T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(4);
        const result = calculateSLOViolation(
          'Status: Untriaged',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-21T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(1);
      });

      it('should calculate SLO violation for Friday', function () {
        const timestamp = '2022-11-18T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(5);
        const result = calculateSLOViolation(
          'Status: Untriaged',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-22T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(2);
      });

      it('should calculate SLO violation for Saturday', function () {
        const timestamp = '2022-11-19T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(6);
        const result = calculateSLOViolation(
          'Status: Untriaged',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-22T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(2);
      });

      it('should calculate SLO violation for Sunday', function () {
        const timestamp = '2022-11-20T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(0);
        const result = calculateSLOViolation(
          'Status: Untriaged',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-22T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(2);
      });
    });

    describe('unrouted label is added', function () {
      it('should calculate SLO violation for Monday', function () {
        const timestamp = '2022-11-14T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(1);
        const result = calculateSLOViolation(
          'Status: Unrouted',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-15T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(2);
      });

      it('should calculate SLO violation for Tuesday', function () {
        const timestamp = '2022-11-15T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(2);
        const result = calculateSLOViolation(
          'Status: Unrouted',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-16T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(3);
      });

      it('should calculate SLO violation for Wednesday', function () {
        const timestamp = '2022-11-16T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(3);
        const result = calculateSLOViolation(
          'Status: Unrouted',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-17T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(4);
      });

      it('should calculate SLO violation for Thursday', function () {
        const timestamp = '2022-11-17T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(4);
        const result = calculateSLOViolation(
          'Status: Unrouted',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-18T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(5);
      });

      it('should calculate SLO violation for Friday', function () {
        const timestamp = '2022-11-18T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(5);
        const result = calculateSLOViolation(
          'Status: Unrouted',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-21T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(1);
      });

      it('should calculate SLO violation for Saturday', function () {
        const timestamp = '2022-11-19T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(6);
        const result = calculateSLOViolation(
          'Status: Unrouted',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-21T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(1);
      });

      it('should calculate SLO violation for Sunday', function () {
        const timestamp = '2022-11-20T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(0);
        const result = calculateSLOViolation(
          'Status: Unrouted',
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-21T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(1);
      });
    });

    describe('other cases', function () {
      it('should not calculate SLO violation for other labels', function () {
        const timestamp = '2022-11-20T23:36:00.000Z';
        expect(
          calculateSLOViolation('Status: Random', 'labeled', timestamp)
        ).toEqual(null);
      });

      it('should not calculate SLO violation for unlabeling of unrouted status', function () {
        const timestamp = '2022-11-20T23:36:00.000Z';
        expect(
          calculateSLOViolation('Status: Unrouted', 'unlabeled', timestamp)
        ).toEqual(null);
      });

      it('should not calculate SLO violation for unlabeling of untriaged status', function () {
        const timestamp = '2022-11-20T23:36:00.000Z';
        expect(
          calculateSLOViolation('Status: Untriaged', 'unlabeled', timestamp)
        ).toEqual(null);
      });
    });
  });
});
