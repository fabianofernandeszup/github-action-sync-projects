require('dotenv').config();

const idx = require("./index");

const inputs = {
    token: process.env.GITHUB_TOKEN,
    debug: 'false',
    owner_source: process.env.REPO_SOURCE.split('/')[0],
    repo_source: process.env.REPO_SOURCE.split('/')[1],
    owner_target: process.env.REPO_TARGET.split('/')[0],
    repo_target: process.env.REPO_TARGET.split('/')[1],
    project_source: process.env.PROJECT_SOURCE,
    project_target: process.env.PROJECT_TARGET,
    columns_source: process.env.COLUMNS_SOURCE,
    columns_target: process.env.COLUMNS_TARGET,
  };

if (process.env.local) {
  console.log('running local');
  idx.processWithInputs(inputs)
}