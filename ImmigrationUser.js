import got from "got";
import config from "./config.js";

// Environment variables
const baseURL = process.env.BASE_URL;
const apiKey = process.env.AUTHENTICATION_KEY;
const rolesets = config.groups[0].rolesets;

export default class ImmigrationUser {
  constructor(userId, username = null, lastRolesetId = null) {
    this.userId = userId;
    this.username = username;
    this.lastRolesetId = lastRolesetId;
  }

  async automatedReview() {
    const response = await got.post(
      `${baseURL}/user/${this.userId}/automated-review`
    );
    console.log(response.body);
  }

  async rankRoleset(rolesetId) {
    if (rolesetId === this.lastRolesetId) {
      return true;
    } else {
      const response = await fetch(`${baseURL}/user/${this.userId}`, {
        method: "POST",
        headers: {
          Authorization: `api-key ${apiKey}`,
          "Content-Type": `application/json`,
        },
        body: JSON.stringify({
          rolesetId: rolesetId,
        }),
      });
      if (response.ok) {
        for (const name in rolesets) {
          const value = rolesets[name];
          if (rolesetId === value) {
            console.log(`${this.username} ranked to ${name}`);
          }
        }

        return true;
      } else {
        return false;
      }
    }
  }

  async rankCitizen() {
    return this.rankRoleset(rolesets.citizen);
  }

  async rankIDC() {
    if (this.lastRolesetId === rolesets.citizen) {
      console.log(`Citizen ${this.username} will be ranked to IDC`);
    }
    return this.rankRoleset(rolesets.idc);
  }

  async getTestStatus(blacklistOnly = false) {
    const data = await got
      .post(
        `${baseURL}/user/${
          this.userId
        }?blacklistOnly=${blacklistOnly.toString()}`
      )
      .json();
    return data.tests;
  }

  async getBlacklistTestStatus() {
    return this.getTestStatus(true);
  }
}
