// Dependencies
import { config as config_env } from "dotenv-safe";
config_env();
import got from "got";
import { performance } from "perf_hooks";
import PQueue from "p-queue";

import config from "./config.js";
import ImmigrationUser from "./ImmigrationUser.js";

const queue = new PQueue({
  concurrency: 1,
  interval: 1000,
  intervalCap: 1,
  timeout: 2000,
  autoStart: true,
});

// Cache
let cachedStartTime = null;

const metricsTemplate = {
  total: 0,
  failed: 0,
  banned: 0,
  testsFailed: {},
};

// Counters

const metrics = {};

function getPerformanceNow() {
  if (!cachedStartTime) {
    cachedStartTime = performance.now();
  }
  return cachedStartTime;
}

function getStringPercentage(number) {
  return `${(number * 100).toFixed(2)}%`;
}

function timeoutPromise(ms, promise) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Promise timed out"));
    }, ms);
    promise.then(
      (res) => {
        clearTimeout(timeoutId);
        resolve(res);
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
}

async function processRoleset(rolesetId, cursor = null, blacklistOnly = false) {
  return new Promise((resolve, reject) => {
    if (metrics[rolesetId] == null || typeof metrics[rolesetId] == undefined) {
      metrics[rolesetId] = JSON.parse(JSON.stringify(metricsTemplate));
    }
    const globalMetrics = metrics[rolesetId];
    globalMetrics["lastCursor"] = cursor;
    globalMetrics["rolesetId"] = rolesetId;
    const startTime = getPerformanceNow();
    const groupURL = `https://groups.roblox.com/v1/groups/${config.groups[0].id}/roles/${rolesetId}/users?`;
    let params = { sortOrder: "Desc", limit: 25 };
    if (cursor && cursor != null) {
      params.cursor = cursor;
    }
    got(groupURL + new URLSearchParams(params), {
      headers: {
        "content-type": "application/json;charset=UTF-8",
        // cookie: `.ROBLOSECURITY=${ROBLOSECURITY};`,
      },
    })
      .then((response) => {
        if (response) {
          const json = JSON.parse(response.body);
          cursor = json.nextPageCursor;
          json.data.forEach((value) => {
            const user = new ImmigrationUser(
              value.userId,
              value.username,
              rolesetId
            );

            const rolesets = config.groups[0].rolesets;

            let priority = 0;

            switch (rolesetId) {
              case rolesets.pending:
                priority = 1;
                break;
              case rolesets.idc:
                priority = 0;
                break;
              case rolesets.citizen:
                priority = 0;
                break;
              default:
                priority = 0;
                break;
            }

            (async () => {
              try {
                await queue.add(
                  async () => {
                    switch (rolesetId) {
                      case rolesets.citizen:
                        console.log("Citizen processing");
                        break;
                      default:
                        break;
                    }
                    await user.automatedReview();
                  },
                  {
                    priority: priority,
                  }
                );
              } catch (error) {
                console.error("error ocfured");
              }
            })();
          });

          Promise.resolve()
            .then(() => {
              if (cursor && cursor != null) {
                console.dir(globalMetrics);
                console.log(queue.size);
                if (config.testMode) {
                  const used = process.memoryUsage();
                  for (let key in used) {
                    console.log(
                      `${key} ${
                        Math.round((used[key] / 1024 / 1024) * 100) / 100
                      } MB`
                    );
                  }
                }
                console.log(
                  `Next cursor ${cursor} in ${config.cursorInterval} seconds`
                );
                setTimeout(() => {
                  resolve(processRoleset(rolesetId, cursor, blacklistOnly));
                }, config.cursorInterval * 1000);
              } else {
                if (globalMetrics.total != 0) {
                  const endTime = performance.now();
                  const timeElapsed = endTime - startTime;
                  const msPerUser = timeElapsed / globalMetrics.total;
                  const usersPerSecond = 1000 / msPerUser;
                  console.log(
                    `Processed ${globalMetrics.total} users in ${(
                      timeElapsed / 1000
                    ).toFixed(3)} seconds`
                  );
                  console.log(`Time per user: ${msPerUser.toFixed(3)} ms`);
                  console.log(
                    `Processing rate: ${Math.floor(
                      usersPerSecond
                    )} users / second`
                  );
                }
                console.log(`-`);
                resolve(true);
              }
            })
            .catch((err) => {
              console.error(err);
              resolve(processRoleset(rolesetId, cursor));
            });
        }
      })
      .catch(console.error);
  });
}

function getMostFailedMetric(rolesetId) {
  const obj = metrics[rolesetId].testsFailed;
  if (Object.keys(obj).length === 0 && obj.constructor === Object) {
    return false;
  }
  return Object.keys(obj).reduce((a, b) => (obj[a] > obj[b] ? a : b));
}

function getRolesetNameFromId(id) {
  const rolesets = config.groups[0].rolesets;
  const entries = Object.entries(rolesets);
  for (const [key, value] of entries) {
    if (id === value) {
      return key;
    }
  }
  return "unknown";
}

async function rolesetProcessor(
  rolesetId,
  cursor = null,
  blacklistOnly = false
) {
  return new Promise((resolve, reject) => {
    console.log(`Resolving rolesetID ${rolesetId}`);
    processRoleset(rolesetId, cursor, blacklistOnly)
      .then(() => {
        const rolesetMetrics = metrics[rolesetId];

        console.log(
          `Resolved ${rolesetId} - ${getRolesetNameFromId(rolesetId)}`
        );
        if (rolesetMetrics.total != 0) {
          console.dir(rolesetMetrics);
          const mostFailedTest = getMostFailedMetric(rolesetId);
          const mostFailedTestCount =
            rolesetMetrics.testsFailed[mostFailedTest];
          const passedCount = rolesetMetrics.total - mostFailedTestCount;
          console.log(`Most failed test: ${mostFailedTest}`);
          console.log(
            `Only ${passedCount} out of ${
              rolesetMetrics.total
            } (${getStringPercentage(
              passedCount / rolesetMetrics.total
            )}) players passed.`
          );
        } else {
          console.log(`${rolesetId} was empty`);
        }
        metrics[rolesetId] = JSON.parse(JSON.stringify(metricsTemplate));
        resolve();
      })
      .catch(reject);
  });
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rolesetLoop(rolesetId, cursor = null, blacklistOnly = false) {
  while (true) {
    try {
      await rolesetProcessor(rolesetId, cursor, blacklistOnly);
      await timeout(5000);
    } catch (error) {
      console.error(error);
      await timeout(30000);
    }
  }
}

async function idcLoop(cursor = null, blacklistOnly = false) {
  return rolesetLoop(config.groups[0].rolesets.idc, cursor, blacklistOnly);
}

async function pendingLoop(cursor = null, blacklistOnly = false) {
  return rolesetLoop(config.groups[0].rolesets.pending, cursor, blacklistOnly);
}

async function citizenLoop(cursor = null, blacklistOnly = true) {
  return rolesetLoop(config.groups[0].rolesets.citizen, cursor, blacklistOnly);
}

async function processingLoop() {
  try {
    pendingLoop();
    idcLoop();
    citizenLoop();
  } catch (error) {
    console.error(error);
  }
}

console.log("-----------------------------------------------------------");
console.log("Starting BlueWizard");
console.log("-----------------------------------------------------------");

processingLoop();
