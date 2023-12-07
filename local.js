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
    column_todo_source: process.env.COLUMN_TODO_SOURCE,
    column_todo_target: process.env.COLUMN_TODO_TARGET,
    column_inprogress_source: process.env.COLUMN_INPROGRESS_SOURCE,
    column_inprogress_target: process.env.COLUMN_INPROGRESS_TARGET,
    column_done_source: process.env.COLUMN_DONE_SOURCE,
    column_done_target: process.env.COLUMN_DONE_TARGET,
  };

if (process.env.local) {
  console.log('running local');
  idx.processWithInputs(inputs)
}