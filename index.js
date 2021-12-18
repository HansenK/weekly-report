import * as readline from "readline";
import * as dotenv from "dotenv";
import * as fs from 'fs'
import clipboardy from "clipboardy";
import inquirer from 'inquirer'
import axios from "axios";
import {startOfWeek, format, subWeeks, endOfWeek} from 'date-fns'

const THIS_WEEK_PERIOD = 'This week'
const LAST_WEEK_PERIOD = 'Last week'

const getRequestsHeader = (apiToken) => ({
  Authorization: `Basic ${Buffer.from(`${apiToken}:api_token`, "utf8").toString(
    "base64"
  )}`,
})

const getTogglWorkspaces = async (apiToken) => {
  const src = `https://api.track.toggl.com/api/v8/workspaces`

  const headers = getRequestsHeader(apiToken)
  const response = await axios.get(src, {
    headers,
    responseType: "json",
  });

  return response.data;
}

const getTogglResponse = async (workspaceId, token, selectedPeriod) => {
  const since = (() => {
    if (selectedPeriod === THIS_WEEK_PERIOD) {
      return format(startOfWeek(new Date(), {weekStartsOn: 1}), 'yyyy-MM-dd')
    }
    if (selectedPeriod === LAST_WEEK_PERIOD) {
      return format(subWeeks(startOfWeek(new Date(), {weekStartsOn: 1}), 1), 'yyyy-MM-dd')
    }

    return ''
  })()

  const until = (() => {
    if (selectedPeriod === THIS_WEEK_PERIOD) {
      return format(endOfWeek(new Date(), {weekStartsOn: 1}), 'yyyy-MM-dd')
    }
    if (selectedPeriod === LAST_WEEK_PERIOD) {
      return format(subWeeks(endOfWeek(new Date(), {weekStartsOn: 1}), 1), 'yyyy-MM-dd')
    }

    return ''
  })()

  console.log('period:', since, '-', until)

  const src = `https://api.track.toggl.com/reports/api/v2/summary?workspace_id=${workspaceId}&since=${since}&until=${until}&user_agent=weekly_report_script`;

  const headers = getRequestsHeader(token)
  const response = await axios.get(src, {
    headers,
    responseType: "json",
  });

  return response.data;
};

const getProjectsEntriesFromResponse = (togglResponse) => {
  const data = togglResponse.data;
  return data.map(project => ({
    projectName: project.title.project,
    entries: project.items.map(item => item.title.time_entry)
  }))
}

const showReportToggl = (togglResponse) => {
  const totalHours = Math.floor(togglResponse.total_grand / 3600000).toFixed(0);
  const totalMinutes = Math.floor((togglResponse.total_grand / (1000 * 60)) % 60).toFixed(0);
  const projectsEntries = getProjectsEntriesFromResponse(togglResponse)

  console.log("This is your report:\n\n");

  const report = `Total Hours: ${totalHours}:${totalMinutes}\n\n${projectsEntries.map((project, index) => {
    const isLastProject = index === projectsEntries.length - 1

    const projectEntries = project.entries.reduce((text, entry) => {
      text += `- ${entry}\n`
      return text
    }, '')

    return `PROJECT: ${project.projectName}\n\n${projectEntries}${isLastProject ? '' : `\n\n`}`
  })}` 
  
  console.log(report)

  clipboardy.writeSync(report);
  console.log("\n\nYour report has been copied to you clipboard!");
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const init = () => {
  console.clear();
  dotenv.config();

  rl.on("close", () => {
    process.exit(0);
  });
};

const main = async () => {
  init();

  const envToken = process.env.API_TOKEN;
  const envWorkspaceId = process.env.WORKSPACE_ID;

  let token = envToken;
  if (!token) {
    await inquirer.prompt([
      {
        name: 'token',
        message: 'Enter your Toggl API Token:'
      }
    ]).then(answers => {
      token = answers.token
    })
  }

  const workspaces = await getTogglWorkspaces(token)
  const workspacesNames = workspaces.map(workspace => `${workspace.name} (${workspace.id})`)

  let workspaceId = envWorkspaceId

  if (!workspaceId) {
    await inquirer.prompt([
      {
        type: 'list',
        message: 'Select the Workspace: ',
        choices: workspacesNames,
        name: 'workspace'
      }
    ]).then(answers => {
      const selectedWorkspace = workspaces.find(workspace => answers.workspace === `${workspace.name} (${workspace.id})`)
      if (!selectedWorkspace) return console.error("Error while selecting the workspace.")
      workspaceId = selectedWorkspace.id
    })
  }

  if (!envToken && token) {
    fs.appendFile('.env', `\nAPI_TOKEN=${token}`, (err) => {
      if (err) throw err;
    })
  }

  if (!envWorkspaceId && workspaceId) {
    fs.appendFile('.env', `\nWORKSPACE_ID=${workspaceId}`, (err) => {
      if (err) throw err;
    })
  }

  if (!token || !workspaceId) {
    console.warn("The variables are not valid.")
    process.exit(0);
  }

  let selectedPeriod = ''
  await inquirer.prompt([
    {
      type: 'list',
      message: 'Select the period of the report',
      choices: [LAST_WEEK_PERIOD, THIS_WEEK_PERIOD],
      name: 'report_period'
    }
  ]).then(answers => {
    selectedPeriod = answers.report_period;
  })

  const togglResponse = await getTogglResponse(workspaceId, token, selectedPeriod);
  showReportToggl(togglResponse);

  process.exit(0);
};

main()