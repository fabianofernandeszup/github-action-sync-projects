const core = require('@actions/core');
const github = require('@actions/github');
const { graphql } = require("@octokit/graphql");

debugEnabled = true
const STATUS_FIELD = "Status"

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
  showLog("Starting")
  debugEnabled = inputs.debug == 'true'
  showDebug(inputs);
  // Get Projects From Repo
  let projectsSource = await getRepositoryProjects(inputs.token, inputs.owner_source, inputs.repo_source);
  let projectsTarget = await getRepositoryProjects(inputs.token, inputs.owner_target, inputs.repo_target);
  if (projectsSource?.length===0) {
    console.log("########### Error: No projects found in repo source: ["+inputs.owner_source+"/"+inputs.repo_source+"] ###############")
    process.exit(1)
  }
  if (projectsSource?.length===0) {
    console.log("########### Error: No projects found in repo source ["+inputs.owner_target+"/"+inputs.repo_target+"] ###############")
    process.exit(1)
  }

  const projectSource = projectsSource.filter((p) => p.title === inputs.project_source).pop()
  const projectTarget = projectsTarget.filter((p) => p.title === inputs.project_target).pop()
  if (!projectSource) {
    console.log("########### Error: Source Project was not found with name: ["+inputs.project_source+"] ###############")
    process.exit(1)
  } else {
    console.log("########### Source project found with name: ["+inputs.project_source+"] ###############")
  }
  if (!projectTarget) {
    console.log("########### Error: Target Project was not found with name: ["+inputs.project_target+"] ###############")
    process.exit(1)
  } else {
    console.log("########### Target project found with name: ["+inputs.project_target+"] ###############")
  }

  const name_columns_source = inputs.columns_source.split(',')
  const name_columns_target = inputs.columns_target.split(',')

  if (name_columns_source.length !== name_columns_target.length) {
    console.log("########### Error: The source and target columns must have the same number ###############")
    console.log("########### Error: Target columns length: ["+name_columns_source.length+"] ###############")
    console.log("########### Error: Source columns length: ["+name_columns_target.length+"] ###############")
    process.exit(1)
  } else {
    console.log("########### Target columns found: ["+name_columns_source.toString()+"] ###############")
    console.log("########### Source columns found: ["+name_columns_target.toString()+"] ###############")
  }

  const columns_source = await getProjectColumns(inputs.token, projectSource.id)
  const check_columns_source = name_columns_source.filter((name_column) => ! columns_source.options.some((option) => option.name === name_column))
  if (check_columns_source.length > 0 ) {
    console.log("########### Error: Some columns were not found in the source project: ["+check_columns_source.toString()+"] ###############")
    process.exit(1)
  }

  const columns_target = await getProjectColumns(inputs.token, projectTarget.id)
  const check_columns_target = name_columns_target.filter((name_column) => ! columns_target.options.some((option) => option.name === name_column))
  if (check_columns_target.length > 0 ) {
    console.log("########### Error: Some columns were not found in the target project: ["+check_columns_target.toString()+"] ###############")
    process.exit(1)
  }

  const card_source = await getProjectCards(inputs.token, projectSource.id, name_columns_source);
  const card_target = await getProjectCards(inputs.token, projectTarget.id, name_columns_target);

  const new_cards_target = await addNewCardsToTarget(inputs.token, card_source, card_target, projectTarget.id)
  await moveNewCardsOnTarget(inputs.token, card_source, new_cards_target, projectTarget.id, columns_source, columns_target, name_columns_source, name_columns_target)

  const all_card_target = await getProjectCards(inputs.token, projectTarget.id, name_columns_target);
  await moveAllCardsOnSource(inputs.token, card_source, all_card_target, projectSource.id, columns_source, columns_target, name_columns_source, name_columns_target)

  showLog("Done")
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

async function addNewCardsToTarget(token, card_source, card_target, projectId) {
  let idCardsTarget = card_target.map((card) => card.content.id)
  let newCards = card_source.filter((card) => !idCardsTarget.includes(card.content.id))

  let mutations = []
  let mudtionsReturn = []
  for (let card of newCards) {
    let mutation = `MyMutation` + card.content.id.replaceAll('-', '').replaceAll('_', '0') + `: addProjectV2ItemById(input: {contentId: "` + card.content.id + `", projectId: "` + projectId + `"}) { item {id, content {... on Issue {id},... on PullRequest {id}}}}`
    if (mutation) mutations.push(mutation)
  }
  if (mutations.length) {
    mudtionsReturn = await runMutations(token, mutations);
  }
  return mudtionsReturn;
}

async function moveNewCardsOnTarget(token, card_source, card_target, projectId, columns_source, columns_target, name_columns_source, name_columns_target) {
  if (card_target.length === 0) {
    console.log('########### No new Cards to be added on target project ###############')
    return
  }

  let mutations = []

  for (let card of card_source) {
    let sourceOptionIdPosition = name_columns_source.indexOf(card.fieldValueByName.name)
    let targetColumn = columns_target.id
    // let targetOptionid = columns_target.options.filter((option) => option.name === name_columns_target[sourceOptionIdPosition] ).pop()
    let targetOptionid = columns_target.options.filter((option) => option.name === name_columns_target[0] ).pop()
    let itemTarget = card_target.filter((cardT) => cardT.item.content.id === card.content.id).pop()
    if (itemTarget) {
      let mutation = `MyMutation` + card.content.id.replaceAll('-', '').replaceAll('_', '0') + `: updateProjectV2ItemFieldValue(input: {projectId: "` + projectId + `", itemId: "` + itemTarget.item.id + `", fieldId: "` + targetColumn + `",  value: { singleSelectOptionId: "` + targetOptionid.id + `" }}) {clientMutationId}`
      if (mutation) mutations.push(mutation)
    }
  }
  if (mutations.length) {
    await runMutations(token, mutations);
  } else {
    console.log('########### No new Cards to be added on target project ###############')
  }
  return
}

async function moveAllCardsOnSource(token, card_source, card_target, projectId, columns_source, columns_target, name_columns_source, name_columns_target) {
  let mutations = []
  for (let card of card_source) {
    let itemTarget = card_target.filter((cardT) => cardT.content.id === card.content.id).pop()
    if (itemTarget) {
      let targetOptionIdPosition = name_columns_target.indexOf(itemTarget.fieldValueByName.name)
      let sourceColumn = columns_source.id
      let sourceOptionid = columns_source.options.filter((option) => option.name === name_columns_source[targetOptionIdPosition] ).pop()
      if (sourceOptionid.id !== card.fieldValueByName.optionId) {
        console.log("############## Moving Card ["+ card.content.title +"] from ["+card.fieldValueByName.name+"] to ["+sourceOptionid.name+"] ##################")
        let mutation = `MyMutation` + card.content.id.replaceAll('-', '').replaceAll('_', '0') + `: updateProjectV2ItemFieldValue(input: {projectId: "` + projectId + `", itemId: "` + card.id + `", fieldId: "` + sourceColumn + `",  value: { singleSelectOptionId: "` + sourceOptionid.id + `" }}) {clientMutationId}`
        if (mutation) mutations.push(mutation)
      } else {
        console.log("############## The Card ["+ card.content.title +"] it's already in the correct column ["+card.fieldValueByName.name+"] ##################")
      }

    }
  }
  if (mutations.length) {
    await runMutations(token, mutations);
  } else {
    console.log('########### No Cards to be synchronized ##############')
  }
  return mutations.length;
}


async function runMutations(token, mutations) {
  let perPage = 10;
  const chunkMutations = sliceIntoChunks(mutations, perPage);
  let clientMutationsId = []
  for (chunk of chunkMutations) {
    const queryMutation = `mutation {` + chunk.join('\n') + `}`;    
    const clientMutationId = await execQuery(token, 'queryMutation', queryMutation);
    for (const [key, value] of Object.entries(clientMutationId)) {
      clientMutationsId.push(value)
    }
  }
  // consolelog('clientMutationsId', clientMutationsId)
  return clientMutationsId
}

async function getProjectCards(token, projectId, name_columns, no_status = false) {
  let perPage = 50;
  let hasNextPage = false
  let endCursor = ''
  let cards = {}
  do {
    let queryEndCursor = endCursor !== '' ? `, after: "` + endCursor + `"` : '';

    const queryGetCards = `{
      node(id: "` + projectId + `") {
        ... on ProjectV2 {
          items(first: ` + perPage + queryEndCursor + `) {
            nodes {
              type
              id
              content {
                  ... on Issue {
                      id
                      url
                      title
                      repository {
                          nameWithOwner
                      }
                  }
                  ... on PullRequest {
                      id
                      url
                      title
                      repository {
                          nameWithOwner
                      }
                  }
              }
              fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                      field {
                          ... on ProjectV2SingleSelectField {
                              id
                              name
                          }
                      }
                      name
                      optionId
                      nameHTML
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

    cards = node?.items?.nodes.filter((card) =>
        (no_status || card.fieldValueByName !== null) &&
        card.type !== 'DRAFT_ISSUE' &&
        (no_status || name_columns.includes(card.fieldValueByName.name))
    )
    let pageInfo = node.items.pageInfo;
    hasNextPage = pageInfo.hasNextPage;
    endCursor = pageInfo.endCursor;

  } while (hasNextPage)

  return cards
}


async function getProjectColumns(token, projectId) {
  let perPage = 50;
  let hasNextPage = false
  let endCursor = ''
  let columns = {}
  do {
    // Get Card Of Project
    let queryEndCursor = endCursor !== '' ? `, after: "` + endCursor + `"` : '';

    const queryGetColumns = `{
      node(id: "` + projectId + `") {
        ... on ProjectV2 {
          fields(first: ` + perPage + queryEndCursor + `) {
            nodes {
                ... on ProjectV2SingleSelectField {
                    id
                    name
                    options(names: null) {
                        id
                        name
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
    const {node} = await execQuery(token, 'queryGetColumns', queryGetColumns);

    columns = node?.fields?.nodes.filter((field) => field.name === STATUS_FIELD).pop();
    let pageInfo = node.fields.pageInfo;

    hasNextPage = pageInfo.hasNextPage;
    endCursor = pageInfo.endCursor;
  } while (hasNextPage)

  return columns;
}

async function run() {
  try {
    const inputs = {
      token: core.getInput('github-token', {required: true}),
      debug: core.getInput('debug', {required: false}),
      owner_source: core.getInput('owner-source', {required: true}),
      repo_source: core.getInput('repo-source', {required: true}),
      owner_target: core.getInput('owner-target', {required: true}),
      repo_target: core.getInput('repo-target', {required: true}),
      project_source: core.getInput('project-source', {required: true}),
      project_target: core.getInput('project-target', {required: true}),
      columns_source: core.getInput('columns-source', {required: true}),
      columns_target: core.getInput('columns-target', {required: true}),
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
  if (optionalParams) {
    console.log('-----------------', message, '-------------------', ...optionalParams)
  } else {
    console.log(message, ...optionalParams)
  }
}

function consolelog(title, message) {
    console.log('-----------------', title, '-------------------')
    console.dir(message, {depth:null})
    console.log('-----------------/', title, '-------------------')
}

if (!process.env.local) {
  console.log('running pipe', process.env.local)
  run()
}

module.exports = { processWithInputs }