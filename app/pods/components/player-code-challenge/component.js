import Component from "@ember/component";
import { alias } from "ember-decorators/object/computed";
import { service } from "ember-decorators/service";
import { computed } from "ember-decorators/object";
import { task, timeout } from "ember-concurrency";

export default class CodeChallengeComponent extends Component {
  @service api;
  @service ajax;
  @service hbApi;
  @service currentUser;
  @alias("payload") code;

  sourceCode = "";
  customInput = "";
  customOutput = "";
  runError = "";
  language = "cpp";
  classNames = ["height-100"];

  maxPollCount = 20;

  @computed("sourceCode")
  sourceCodeBase64() {
    return window.btoa(this.get("sourceCode"));
  }

  @computed("problemJsonApiPayload")
  problem() {
    const payload = this.get("problemJsonApiPayload");
    return payload ? payload.data.attributes : {};
  }

  @computed("tab")
  tabName() {
    return this.get('tab') || "problem"
  }

  @computed("problemJsonApiPayload")
  codeStubs() {
    const payload = this.get("problemJsonApiPayload");
    if (!payload) return [];
    const checkList = {
      java: true,
      cpp: true,
      c: true,
      py2: true,
      csharp: true,
      js: true
    };
    return payload.included
      .filter(stubs => {
        if (checkList[stubs.attributes.language] && stubs.attributes.body) {
          checkList[stubs.attributes.language] = false;
          return true;
        } else {
          return false;
        }
      })
      .map(stub => stub.attributes);
  }

  @computed("customInput")
  customInputBase64() {
    return window.btoa(this.get("customInput"));
  }

  didReceiveAttrs() {
    this._super(...arguments);
    const code = this.get("code");
    const run = this.get("run");
    if (this.get('problemJsonApiPayload') && +this.get('problemJsonApiPayload.data.id') === code.get("hbProblemId")) {
      return
    }
    this.get("hbApi")
      .request("problems", {
        data: {
          contest_id: run.get("contestId"),
          problem_id: code.get("hbProblemId")
        },
      })
      .then(result => {
        this.set("problemJsonApiPayload", result);
      })
      .catch(err => {
        console.log(err);
      });
  }

  runCodeTask = task(function*(config) {
    const { submissionId } = yield this.get("hbApi").request("submissions", {
      method: "POST",
      data: {
        custom_input: config.input,
        source: config.source,
        language: config.lang
      }
    });
    return yield this.get("_pollForSubmissionTask").perform(submissionId);
  });

  submitCodeTask = task(function*(config) {
    const code = this.get("code");
    const run = this.get("run");
    const { submissionId } = yield this.get("hbApi").request("submissions", {
      method: "POST",
      data: {
        contestId: run.get("contestId"),
        problemId: code.get("hbProblemId"),
        language: config.lang,
        source: config.source
      }
    });
    yield this.get("_pollForSubmissionTask").perform(submissionId);
    
    //invalidate leaderboard cache
    const runId = this.get('run.id')
    return this.get('api').request(`/runs/${runId}/leaderboard/invalidate`, {
      method: 'POST'
    })
  });

  _pollForSubmissionTask = task(function*(submissionId) {
    for (let i = 0; i < this.get("maxPollCount"); i++) {
      const result = yield this.get("hbApi").request(
        "submissions/result/" + submissionId,
        {
          xhrFields: {
            withCredentials: true
          }
        }
      );
      if (result && result.result) {
        return result;
      }
      yield timeout(3000);
    }
    return { err: "Cannot Connect to HB" };
  });
}
