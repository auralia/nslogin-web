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
import {NsApi} from "nsapi";
import Ui from "./ui";
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
    private _pause: boolean;
    private _userAgent: string;

    /**
     * Initializes a new instance of the App class.
     */
    constructor() {
        this.reset();
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
        return name.replace("_", " ")
                   .trim()
                   .toLowerCase()
                   .replace(" ", "_");
    }

    /**
     * Sleeps for the specified number of milliseconds.
     *
     * @param ms The number of milliseconds to sleep.
     *
     * @return A promise fired after sleeping for the specified number of
     * milliseconds.
     */
    private static async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Logs into or restores the nations given by the specified credentials,
     * depending on the mode specified.
     *
     * @param userAgent The user agent specified by the user.
     * @param rateLimit The rate limit to be used by the API.
     * @param mode The operating mode of the application.
     * @param credentials The names and passwords of the nations to log into or
     *                    restore.
     * @param verbose Whether or not to print out detailed error messages.
     */
    public async start(userAgent: string, rateLimit: number, mode: Mode,
                       credentials: Credential[],
                       verbose: boolean): Promise<void>
    {
        this.reset();

        this._userAgent = `nslogin-web (maintained by Auralia, currently`
                          + ` used by "${userAgent}")`;

        const api = new NsApi(userAgent, true, rateLimit);

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
        await this.waitUntilUnpaused();

        Ui.handleFinish();
    }

    /**
     * Cancels the current activity being performed by the app.
     */
    public cancel() {
        Ui.log("info", "Cancelling...");
        this._cancel = true;
        this._pause = false;
    }

    /**
     * Pauses the current activity.
     */
    public pause() {
        Ui.log("info", "Pausing...");
        this._pause = true;
    }

    /**
     * Resumes the current activity.
     */
    public unpause() {
        Ui.log("info", "Unpausing...");
        this._pause = false;
    }

    /**
     * Returns whether the app is paused.
     *
     * @return Whether the app is paused.
     */
    public isPaused() {
        return this._pause;
    }

    /**
     * Resets the app.
     */
    private reset() {
        this._cancel = false;
        this._pause = false;
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
            await this.waitUntilUnpaused();
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
            await this.waitUntilUnpaused();
            try {
                Ui.log("info", `${credential.nation}: Logging in...`);
                await api.nationRequest(credential.nation,
                                        ["nextissuetime"],
                                        {},
                                        {password: credential.password},
                                        true);
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
            await this.waitUntilUnpaused();
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
                iframe.contents().find("#restoreLoggingIn").val(
                    "1");
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
     * Sleeps until unpaused.
     *
     * @return A promise fired when the app is unpaused.
     */
    private async waitUntilUnpaused() {
        while (this._pause) {
            await App.sleep(1000);
        }
    }
}
