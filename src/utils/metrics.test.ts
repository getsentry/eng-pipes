import { UNROUTED_LABEL, UNTRIAGED_LABEL } from '@/config';

import {
  calculateSLOViolationRoute,
  calculateSLOViolationTriage,
} from './metrics';

describe('metrics tests', function () {
  describe('calculateSLOViolationTriage', function () {
    it('should not calculate SLO violation if label is not untriaged', function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = calculateSLOViolationTriage(
        'Status: Test',
        'labeled',
        timestamp
      );
      expect(result).toEqual(null);
    });

    it('should not calculate SLO violation if label is unrouted', function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = calculateSLOViolationTriage(
        'Status: Unrouted',
        'labeled',
        timestamp
      );
      expect(result).toEqual(null);
    });

    it('should calculate SLO violation for Monday', function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(1);
      const result = calculateSLOViolationTriage(
        UNTRIAGED_LABEL,
        'labeled',
        timestamp
      );
      expect(result).toEqual('2022-11-16T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(3);
    });

    it('should calculate SLO violation for Tuesday', function () {
      const timestamp = '2022-11-15T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(2);
      const result = calculateSLOViolationTriage(
        UNTRIAGED_LABEL,
        'labeled',
        timestamp
      );
      expect(result).toEqual('2022-11-17T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(4);
    });

    it('should calculate SLO violation for Wednesday', function () {
      const timestamp = '2022-11-16T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(3);
      const result = calculateSLOViolationTriage(
        UNTRIAGED_LABEL,
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
      const result = calculateSLOViolationTriage(
        UNTRIAGED_LABEL,
        'labeled',
        timestamp
      );
      expect(result).toEqual('2022-11-21T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(1);
    });

    it('should calculate SLO violation for Friday', function () {
      const timestamp = '2022-11-18T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(5);
      const result = calculateSLOViolationTriage(
        UNTRIAGED_LABEL,
        'labeled',
        timestamp
      );
      expect(result).toEqual('2022-11-22T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(2);
    });

    it('should calculate SLO violation for Saturday', function () {
      const timestamp = '2022-11-19T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(6);
      const result = calculateSLOViolationTriage(
        UNTRIAGED_LABEL,
        'labeled',
        timestamp
      );
      expect(result).toEqual('2022-11-22T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(2);
    });

    it('should calculate SLO violation for Sunday', function () {
      const timestamp = '2022-11-20T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(0);
      const result = calculateSLOViolationTriage(
        UNTRIAGED_LABEL,
        'labeled',
        timestamp
      );
      expect(result).toEqual('2022-11-22T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(2);
    });

    describe('calculateSLOViolationRoute', function () {
      it('should not calculate SLO violation if label is not untriaged', function () {
        const timestamp = '2022-11-14T23:36:00.000Z';
        const result = calculateSLOViolationRoute(
          'Status: Test',
          'labeled',
          timestamp
        );
        expect(result).toEqual(null);
      });

      it('should not calculate SLO violation if label is untriaged', function () {
        const timestamp = '2022-11-14T23:36:00.000Z';
        const result = calculateSLOViolationRoute(
          'Status: Untriaged',
          'labeled',
          timestamp
        );
        expect(result).toEqual(null);
      });

      it('should calculate SLO violation for Monday', function () {
        const timestamp = '2022-11-14T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(1);
        const result = calculateSLOViolationRoute(
          UNROUTED_LABEL,
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-15T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(2);
      });

      it('should calculate SLO violation for Tuesday', function () {
        const timestamp = '2022-11-15T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(2);
        const result = calculateSLOViolationRoute(
          UNROUTED_LABEL,
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-16T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(3);
      });

      it('should calculate SLO violation for Wednesday', function () {
        const timestamp = '2022-11-16T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(3);
        const result = calculateSLOViolationRoute(
          UNROUTED_LABEL,
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-17T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(4);
      });

      it('should calculate SLO violation for Thursday', function () {
        const timestamp = '2022-11-17T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(4);
        const result = calculateSLOViolationRoute(
          UNROUTED_LABEL,
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-18T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(5);
      });

      it('should calculate SLO violation for Friday', function () {
        const timestamp = '2022-11-18T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(5);
        const result = calculateSLOViolationRoute(
          UNROUTED_LABEL,
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-21T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(1);
      });

      it('should calculate SLO violation for Saturday', function () {
        const timestamp = '2022-11-19T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(6);
        const result = calculateSLOViolationRoute(
          UNROUTED_LABEL,
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-21T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(1);
      });

      it('should calculate SLO violation for Sunday', function () {
        const timestamp = '2022-11-20T23:36:00.000Z';
        expect(new Date(timestamp).getDay()).toEqual(0);
        const result = calculateSLOViolationRoute(
          UNROUTED_LABEL,
          'labeled',
          timestamp
        );
        expect(result).toEqual('2022-11-21T23:36:00.000Z');
        expect(new Date(result).getDay()).toEqual(1);
      });
    });
  });
});
