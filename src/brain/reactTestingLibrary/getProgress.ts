import fs from 'fs';
import path from 'path';
import child_process from 'child_process';

// temporary sentry cloned respository path
const dirPath = './tmp';
const testsPath = './tmp/tests/js/spec';

const getTestFiles = function (
  dirPath: string,
  arrayOfFiles: string[] | undefined = []
) {
  const files = fs.readdirSync(dirPath);

  files.forEach(function (file) {
    if (fs.statSync(dirPath + '/' + file).isDirectory()) {
      arrayOfFiles = getTestFiles(dirPath + '/' + file, arrayOfFiles);
    } else {
      if (/\.spec.*?$/.test(file)) {
        arrayOfFiles.push(path.join(dirPath, '/', file));
      }
    }
  });

  return arrayOfFiles;
};

export default async function getProgress(data?: string) {
  //delete cloned sentry repository
  if (fs.existsSync(dirPath)) {
    fs.rmdirSync(dirPath, { recursive: true });
  }

  // clone sentry repository
  child_process.execSync(
    `git clone git@github.com:getsentry/sentry.git ${dirPath}`
  );

  const testFiles = getTestFiles(testsPath);
  const testFilesWithEnzymeImport = testFiles.filter((file) => {
    const base64Content = fs.readFileSync(file);
    const content = Buffer.from(base64Content).toString('utf-8');
    return content.includes('sentry-test/enzyme');
  });

  return {
    remainingFiles: testFilesWithEnzymeImport.length,
    progress:
      Math.round(
        (testFilesWithEnzymeImport.length / testFiles.length) * 10000
      ) / 100,
  };
}
