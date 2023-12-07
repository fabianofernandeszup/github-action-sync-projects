const core = require('@actions/core');
const github = require('@actions/github');
const { graphql } = require("@octokit/graphql");
const { Repository } = require("@octokit/graphql-schema");

debugEnabled = false

// Toolkit docs: https://github.com/actions/toolkit

async function execQuery(token, title, query) {
  if (debugEnabled) {
    showQuery(title, query);
  }
  const result = await graphql(
    query,
    {
      headers: {
        authorization: `token ` + token,
      },
    }
  );
  showDebug(result);
  return result;
}


async function processWithInputs(inputs) {
  debugEnabled = inputs.debug == 'true'
  showDebug(inputs);
  // Get Projects From Repo
  let projectsSource = await getRepositoryProjects(inputs.token, inputs.owner_source, inputs.repo_source);
  let projectsTarget = await getRepositoryProjects(inputs.token, inputs.owner_target, inputs.repo_target);

  if (projectsSource?.length && projectsTarget?.length) {
    showLog('Number of projects source: ', projectsSource.length)
    showLog('Number of projects target: ', projectsTarget.length)
    const projectSource = projectsSource.filter((p) => p.title === inputs.project_source).pop()
    const projectTarget = projectsTarget.filter((p) => p.title === inputs.project_target).pop()

    if (projectSource && projectTarget) {
      console.log('Projetos encontrados')
      await processProject(inputs.token, projectSource)
      await processProject(inputs.token, projectTarget)
    }
    // for (let project of projectsSource) {
    //   console.log(project.title)
    //   // await processProject(inputs, project)
    // }
    // for (let project of projectsTarget) {
    //   console.log(project.title)
    //   // await processProject(inputs, project)
    // }
    showLog("Done")
  } else {
    showLog("Projects Not Found!")
  }
}

async function getRepositoryProjects(token, owner, repo) {
  // Get Projects From Repo
  let queryRepo = `{
    repository(owner: "`+owner+`", name: "`+repo+`") {
      projectsV2(first: 10) {
        nodes {
          id
          title
        }
      }
    }
    }`

  const { repository } = await execQuery(token, 'queryRepo', queryRepo);

  return repository?.projectsV2?.nodes
}

async function processProject(token, project) {
  showLog("Project Title:", project.title)  
  let hasNextPage = false
  let endCursor = ''
  do {
    // Get Card Of Project    
    const { cards, pageInfo } = await getProjectCards(token, project.id, endCursor);

    console.log(cards)
    for (let item of cards) {
      if (item.node?.fieldValueByName?.name) {
        console.log(item.node?.fieldValueByName)
      }
    }
    // let numberOfChanges = await processChanges(token, cards);
    // showLog('changed ' + numberOfChanges + ' items');

    hasNextPage = pageInfo.hasNextPage;
    endCursor = pageInfo.endCursor;
    // if (numberOfChanges > 0)
    //   return;
  } while (hasNextPage)
}

async function processChanges(token, cards) {
  let mutations = []
    for (let item of cards) {      
      if (item.node?.fieldValueByName?.name) {
        let mutation = checkChangeTitle(token, item.node);
        if (mutation) mutations.push(mutation)        
      }
    }
    if (mutations.length) {
      await runMutations(inputs, mutations);
    }
    return mutations.length;
}

function checkChangeTitle(token, card) {
  let titleStatusSplited = card.fieldValueByName?.name.split('-')
  if (titleStatusSplited[0].trim().length <= 2) {
    let iconStatus = titleStatusSplited[0].trim()
    let newTitleCard = iconStatus + ' ' + sanitizeTitle(card.content.title)
    let needChange = card.content.title !== newTitleCard
    if (needChange) {      
      let mutation = ``
      switch (card.type) {
        case 'ISSUE':
          if (canIncludeRepo(token, card))
            mutation = `MyMutation` + card.content.id.replaceAll('-', '') + `: updateIssue(input: {id: "` + card.content.id + `", title: "` + newTitleCard + `"}) {clientMutationId}`
          break;
        case 'DRAFT_ISSUE':
          mutation = `MyMutation` + card.content.id.replaceAll('-', '') + `: updateProjectV2DraftIssue(input: {draftIssueId: "` + card.content.id + `", title: "` + newTitleCard + `"}) {clientMutationId}`
          break;
        case 'PULL_REQUEST':
          if (canIncludeRepo(token, card))
            mutation = `MyMutation` + card.content.id.replaceAll('-', '') + `: updatePullRequest(input: {pullRequestId: "` + card.content.id + `", title: "` + newTitleCard + `"}) {clientMutationId}`
          break;
      }
      if (mutation)
        console.log('[' + card.type + '] (' + card.id + ') oldtitleCard:', card.content.title, ' | newTitleCard:', newTitleCard)
      else
        console.log('Skipped: ', card.content.title, ' repo: ', card.content.repository?.name)
      return mutation;
    }    
  }
}

function canIncludeRepo(token, card) {
  let cardRepo = card.content.repository.name;
  let sameRepo = cardRepo == inputs.repo;
  if (sameRepo) return true;

  if (inputs.allowedRepos) {
    let arrRepos = inputs.allowedRepos.split(',');
    return arrRepos.includes(cardRepo);
  }
  return false;
}

function sanitizeTitle(title) {
  return title.replace(/[^\u0020-\u007e\u00a0-\u00ff\u0152\u0153\u0178]/g, '').replace(/[\\$'"]/g, "").replace(/  +/g, ' ').trim()
}

async function runMutations(inputs, mutations) {
  let perPage = 10;
  const chunkMutations = sliceIntoChunks(mutations, perPage);
  for (chunk of chunkMutations) {
    const queryMutation = `mutation {` + chunk.join('\n') + `}`;    
    const clientMutationId = await execQuery(inputs, 'queryMutation', queryMutation);
    console.log(clientMutationId)
  }
}

async function getProjectCards(token, projectId, endCursor) {
  let perPage = 50;
  // Get Card Of Project
  let queryEndCursor = endCursor !== '' ? `, after: "` + endCursor + `"` : '';

  const queryGetCards = `{
    node(id: "` + projectId + `") {
      ... on ProjectV2 {
        title
        id
        items(first: ` + perPage + queryEndCursor + `) {
          edges {
            node {
              id
              type
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                }
              }
              content {
                ... on PullRequest {
                  id
                  title       
                  url            
                  repository {
                    name
                  }
                }
                ... on Issue {
                  id
                  title
                  url
                  repository {
                    name
                  }
                }
                ... on DraftIssue {
                  id
                  title
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }`
    
  const {node} = await execQuery(token, 'queryGetCards', queryGetCards);
  return { cards: node.items.edges, pageInfo: node.items.pageInfo };
}

async function run() {
  try {
    const inputs = {
      token: core.getInput('github-token', {required: true}),
      allowedRepos: core.getInput('allowed-repos', {required: false}),
      debug: core.getInput('debug', {required: false}),
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
    };

    await processWithInputs(inputs);

  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

function sliceIntoChunks(arr, chunkSize) {
  const res = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    res.push(chunk);
  }
  return res;
}

function showQuery(title, query) {
  if (debugEnabled) {
    console.log('################ ' + title + ' ##################');
    console.log(query);
  }
}

function showDebug(message, ...optionalParams) {
  if (debugEnabled) {
    console.log(message, ...optionalParams)
  }
}

function showLog(message, ...optionalParams) {
  console.log(message, ...optionalParams)
}

if (!process.env.local) {
  console.log('running pipe', process.env.local)
  run()
}

module.exports = { processWithInputs }