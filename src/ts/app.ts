/**
 * Copyright (C) 2017 Auralia
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import Ui from "./ui";
import {VERSION} from "./main";
import {NsApi} from "nsapi";
import * as util from "util";

/**
 * Represents the operating mode of nslogin-web.
 */
export enum Mode {
    Login,
    Restore,
    Auto
}

/**
 * Represents a nation name and associated password.
 */
export interface Credential {
    nation: string,
    password: string
}

/**
 * Contains the main application logic.
 */
export default class App {
    private _cancel: boolean;
    private _userAgent: string;

    /**
     * Initializes a new instance of the NsLogin class.
     */
    constructor() {
        this.reset();
    }

    /**
     * Logs into or restores the nations given by the specified credentials,
     * depending on the mode specified.
     *
     * @param userAgent The user agent specified by the user.
     * @param mode The operating mode of the application.
     * @param credentials The names and passwords of the nations to log into or
     *                    restore.
     * @param verbose Whether or not to print out detailed error messages.
     */
    public async start(userAgent: string, mode: Mode, credentials: Credential[],
                       verbose: boolean): Promise<void>
    {
        this.reset();

        this._userAgent = `node-nslogin-web ${VERSION} (maintained`
                          + ` by Auralia, currently used by`
                          + ` "${userAgent}")`;

        Ui.log("info", `nslogin-web ${VERSION}`);

        const api = new NsApi(userAgent);

        try {
            if (mode === Mode.Auto) {
                Ui.log("info", "Auto mode");
                await this.auto(api, credentials, verbose);
            } else if (mode === Mode.Login) {
                Ui.log("info", "Login mode");
                await this.loginNations(api, credentials, verbose);
            } else if (mode === Mode.Restore) {
                Ui.log("info", "Restore mode");
                await this.restoreNations(api, credentials, verbose);
            } else {
                throw new Error("Unrecognized mode");
            }
        } finally {
            api.cleanup();
        }

        if (this._cancel) {
            Ui.log("info", "Process cancelled.");
        } else {
            Ui.log("info", "Process complete.");
        }

        Ui.handleFinish();
    }

    /**
     * Cancels the current request.
     */
    public cancel() {
        Ui.log("info", "Cancelling...");
        this._cancel = true;
    }

    /**
     * Resets a cancelled API so that it can be used to make requests again.
     */
    private reset() {
        this._cancel = false;
    }

    /**
     * Logs into or restores the nations given by the specified credentials
     * depending on whether they currently exist.
     *
     * @param api The NsApi instance to use.
     * @param credentials The names and passwords of the nations to log into or
     *                    restore.
     * @param verbose Whether or not to print out detailed error messages.
     */
    private async auto(api: NsApi, credentials: Credential[],
                       verbose: boolean): Promise<void> {
        for (const credential of credentials) {
            if (this._cancel) {
                break;
            }
            let login = true;
            try {
                Ui.log("info", `${credential.nation}: Nation exists`);
                await api.nationRequest(credential.nation, ["name"]);
            } catch (_) {
                Ui.log("info",
                       `${credential.nation}: Nation does not exist`);
                login = false;
            }
            if (login) {
                await this.loginNations(api, [credential], verbose);
            } else {
                await this.restoreNations(api, [credential], verbose);
            }
        }
    }

    /**
     * Logs into the nations given by the specified credentials.
     *
     * @param api The NsApi instance to use.
     * @param credentials The names and passwords of the nations to log into or
     *                    restore.
     * @param verbose Whether or not to print out detailed error messages.
     */
    private async loginNations(api: NsApi,
                               credentials: Credential[],
                               verbose: boolean): Promise<void> {
        for (const credential of credentials) {
            if (this._cancel) {
                break;
            }
            try {
                Ui.log("info", `${credential.nation}: Logging in...`);
                await this.loginRequest(credential);
                const data = await api.nationRequest(credential.nation,
                                                     ["lastlogin"]);
                const now = Date.now() / 1000;
                const lastLogin = parseInt(data["lastlogin"], 10);
                if (now - lastLogin > 30) {
                    Ui.log("error", `${credential.nation}: Login failed`);
                    if (verbose) {
                        Ui.log("error", "More than 30 seconds between now"
                                        + " and last login");
                    }
                } else {
                    Ui.log("info", `${credential.nation}: Login successful`
                                   + ` (or nation was logged into in the`
                                   + ` last 30 seconds)`);
                }
            } catch (err) {
                Ui.log("error", `${credential.nation}: Login failed`);
                if (verbose) {
                    Ui.log("error", util.inspect(err));
                }
            }
        }
    }

    /**
     * Restores the nations given by the specified credentials.
     *
     * @param api The NsApi instance to use.
     * @param credentials The names and passwords of the nations to log into or
     *                    restore.
     * @param verbose Whether or not to print out detailed error messages.
     */
    private async restoreNations(api: NsApi,
                                 credentials: Credential[],
                                 verbose: boolean): Promise<void> {
        for (const credential of credentials) {
            if (this._cancel) {
                break;
            }
            Ui.log("info", `${credential.nation}: Waiting for confirmation...`);
            await Ui.confirm();
            Ui.log("info", `${credential.nation}: Confirmation received,`
                           + ` restoring...`);
            try {
                await this.restoreRequest(credential);
                await api.nationRequest(credential.nation,
                                        ["name"]);
                Ui.log("info", `${credential.nation}: Restore successful (or`
                               + ` nation already existed)`);
            } catch (err) {
                Ui.log("error",
                       `${credential.nation}: Restore failed`);
                if (verbose) {
                    Ui.log("error", util.inspect(err));
                }
            }
        }
    }

    /**
     * Logs into the specified nation using a form in a hidden iframe. Waits 6
     * seconds after doing so in order to confirm to NationStates rate limits.
     *
     * @param credential The name and password of the nation to log into.
     */
    private loginRequest(credential: Credential): Promise<void> {
        return new Promise<void>((resolve) => {
            let resolved = false;

            const iframe = $("#iframe");
            iframe.off("load");
            iframe.on("load", () => {
                iframe.off("load");
                iframe.contents().find("#loginUserAgent").val(this._userAgent);
                iframe.contents().find("#loginLoggingIn").val("1");
                iframe.contents().find("#loginNation").val(
                    App.toId(credential.nation));
                iframe.contents().find("#loginPassword").val(
                    credential.password);
                iframe.contents().find("#loginSubmit").click();

                setTimeout(() => {
                    resolved = true;
                    resolve();
                }, 6000);
            });
            iframe.attr({src: "iframe.html"});

            setTimeout(() => {
                if (!resolved) {
                    resolve();
                }
            }, 15000);
        });
    }

    /**
     * Restores the specified nation using a hidden form. Waits 6 seconds
     * after doing so in order to confirm to NationStates rate limits.
     *
     * @param credential The name and password of the nation to restore.
     */
    private restoreRequest(credential: Credential): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let resolved = false;

            const iframe = $("#iframe");
            iframe.off("load");
            iframe.on("load", () => {
                iframe.off("load");
                iframe.contents().find("#restoreUserAgent").val(
                    this._userAgent);
                iframe.contents().find("#restoreLoggingIn").val("1");
                iframe.contents().find("#restoreNation").val(
                    App.toId(credential.nation));
                iframe.contents().find("#restoreRestoreNation").val(
                    " Restore " + App.toId(credential.nation) + " ");
                iframe.contents().find("#restoreRestorePassword").val(
                    credential.password);
                iframe.contents().find("#restoreSubmit").click();

                setTimeout(() => {
                    resolved = true;
                    resolve();
                }, 6000);
            });
            iframe.attr({src: "iframe.html"});

            setTimeout(() => {
                if (!resolved) {
                    reject();
                }
            }, 15000);
        });
    }

    /**
     * Converts names to a fixed form: all lowercase, with spaces replaced
     * with underscores.
     *
     * @param name The name to convert.
     *
     * @return The converted name.
     */
    private static toId(name: string) {
        return name.replace("_", " ").trim().toLowerCase().replace(" ", "_");
    }
}
