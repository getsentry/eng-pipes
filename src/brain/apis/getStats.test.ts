import getStats, * as utils from './getStats';

const STATS_TEXT = 'Some random team stats';

jest.spyOn(utils, "getOwnershipData").mockReturnValue({
                "team1" : {
                    "public": ["p1"],
                    "private": [],
                    "experimental": [],
                    "unknown": [],
                },
                "team2" : {
                    "public": [],
                    "private": [],
                    "experimental": ["e1"],
                    "unknown": ["u1", "u2"],
                }
            });

describe('api stats', function () {
    it('calculates team stats', async function () {
        getStats("team1").then((response) => {
            expect(response.message).toContain("public: 1(100%)")
        });
    });
    it('calculates overall stats', async function () {
        getStats("").then((response) => {
            expect(response.message).toContain("team1");
            expect(response.message).toContain("team2");
        });
    });
});
