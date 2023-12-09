require('dotenv').config();

const idx = require("./index");

const inputs = {
    token: process.env.GITHUB_TOKEN,
    debug: 'false',
    owner_source: process.env.GITHUB_OWNER_SOURCE,
    repo_source: process.env.GITHUB_REPO_SOURCE,
    owner_target: process.env.GITHUB_OWNER_TARGET,
    repo_target: process.env.GITHUB_REPO_TARGET,
    project_source: process.env.PROJECT_SOURCE,
    project_target: process.env.PROJECT_TARGET,
    columns_source: process.env.COLUMNS_SOURCE,
    columns_target: process.env.COLUMNS_TARGET,
  };

if (process.env.local) {
  console.log('running local');
  idx.processWithInputs(inputs)
}