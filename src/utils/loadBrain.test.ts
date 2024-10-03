import { getBrainModules, getExportedFunctions } from './loadBrain';

jest.unmock('./loadBrain');

describe('loadBrain', function () {
  it('makes sure that for every file in `brain/`, we load at least one function from it', async function () {
    const modules = await getBrainModules();
    const modulesSet = new Set(modules.map((m) => m.split('/').pop())); // Get the filename from the path
    const fns = getExportedFunctions(modules);
    expect(modulesSet).toEqual(new Set(fns.map((f) => f.name))); // Check that the filenames & loaded functions are the same
  });
});
