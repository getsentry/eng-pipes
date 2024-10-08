import { getBrainModules, getExportedFunctions, loadBrain } from './loadBrain';

jest.unmock('./loadBrain');

describe('loadBrain', function () {
  it('makes sure that for every file in `brain/`, we load at least one function from it', async function () {
    const modules = await getBrainModules();
    const fns = getExportedFunctions(modules);

    expect(new Set(modules)).toEqual(new Set(fns.map((f) => f.name)));
  });
  it('makes sure that every exported function in `brain/` is actually loaded', async function () {
    const modules = await getBrainModules();
    const fns = getExportedFunctions(modules);

    const loadedFns = await loadBrain();
    expect(new Set(loadedFns)).toEqual(new Set(fns.map((f) => f.name)));
  });
});
