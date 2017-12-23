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
import App, {Credential, Mode} from "./app";
import * as $ from "jquery";

export default class Ui {
    private readonly _app: App;

    constructor() {
        this._app = new App();
    }

    public init(): void {
        // Initialize auto save checkbox
        let autoLoadSave = false;
        try {
            const autoLoadSaveInput = $("#autoLoadSave");
            const autoLoadSaveRaw = localStorage.getItem("autoLoadSave");
            autoLoadSave = autoLoadSaveRaw !== null
                ? autoLoadSaveRaw === "true" : true;
            autoLoadSaveInput.prop("checked", autoLoadSave);
            autoLoadSaveInput.on("click", () => {
                localStorage.setItem(
                    "autoLoadSave",
                    String(autoLoadSaveInput.is(":checked")));
            });
        } catch {
            // No local storage
        }

        // Initialize tabs
        $("#navbar").find("a").click((e) => {
            e.preventDefault();
            $(e.currentTarget).tab("show");
        });

        // Add handlers
        $("#startButton").on("click", () => {
            this.handleStart().catch((err) => {
                console.error(err);
            });
        });
        $("#pauseButton").on("click", () => this.handlePause());
        $("#cancelButton").on("click", () => this.handleCancel());
        $("#clearButton").on("click", () => Ui.handleClear());
        $("#loadButton").on("click", () => Ui.handleLoad());
        $("#saveButton").on("click", () => Ui.handleSave());
        $(window).on("unload", () => Ui.handleClose());

        // Load configuration
        if (autoLoadSave) {
            Ui.handleLoad();
        }
    }

    /**
     * Logs a message to the log text area.
     *
     * @param type The type of log message (e.g. info, error, etc.)
     * @param message The log message.
     */
    public static log(type: string, message: string) {
        const logElement = $("#log");
        const text = logElement.html();

        message = type + ": " + message;
        if (text !== "") {
            message = "<br>" + message;
        }
        logElement.html(text + message);

        if ($("#scrollToBottom").is(":checked")) {
            logElement.scrollTop(
                Number(logElement.prop("scrollHeight")));
        }
    }

    /**
     * Enables the confirm button and waits for a response.
     */
    public static confirm(): Promise<string> {
        return new Promise((resolve) => {
            const confirmButton = $("#confirmButton");
            confirmButton.prop("disabled", false);
            confirmButton.on("click", () => {
                confirmButton.prop("disabled", true);
                resolve();
            })
        });
    }

    static toggleUi(running: boolean): void {
        const config = $("#configuration");
        config.find("input").prop("disabled", running);
        config.find("textarea").prop("disabled", running);
        config.find("button").prop("disabled", running);

        $("#pauseButton").prop("disabled", !running);
        $("#cancelButton").prop("disabled", !running);
    }

    private static showAlert(id: string, message: string, cssClass: string,
                             containerId: string): void {
        if ($("#" + id).length === 0) {
            $("<div>")
                .attr("id", id)
                .addClass("alert " + cssClass)
                .append(message)
                .appendTo($("#" + containerId));
        }
    }

    private static showValidationAlert(id: string, message: string,
                                       formGroupId: string): void {
        if ($("#" + id).length === 0) {
            $("#" + formGroupId).addClass("has-error");
            Ui.showAlert(id,
                         message,
                         "alert-danger additional-top-spacing",
                         formGroupId);
        }
    }

    private static hideValidationAlert(id: string, formGroupId: string): void {
        $("#" + id).remove();
        $("#" + formGroupId).removeClass("has-error");
    }

    private async handleStart(): Promise<void> {
        const userAgentInput = $("#userAgent");
        const rateLimitInput = $("#rateLimit");
        const verboseInput = $("#verbose");

        let passValidation = true;

        Ui.hideValidationAlert("userAgentValidationAlert",
                               "userAgentFormGroup");
        if (userAgentInput.val() === "") {
            Ui.showValidationAlert("userAgentValidationAlert",
                                   "You must specify a user agent.",
                                   "userAgentFormGroup");
            passValidation = false;
        }

        Ui.hideValidationAlert("credentialsValidationAlert",
                               "credentialsFormGroup");
        let credentials: Credential[] = [];
        try {
            credentials = Ui.getCredentials();
        } catch (err) {
            Ui.showValidationAlert("credentialsValidationAlert",
                                   err.message,
                                   "credentialsFormGroup");
            passValidation = false;
        }

        if (!passValidation) {
            return;
        }

        const userAgent = String(userAgentInput.val());
        let mode: Mode = Ui.getMode();
        const verbose = verboseInput.is(":checked");

        Ui.toggleUi(true);
        $("#navbar").find("a[href='#status']").tab("show");

        await this._app.start(userAgent, Number(rateLimitInput.val()),
                              mode, credentials, verbose);
    }

    private handlePause(): void {
        if (this._app.isPaused()) {
            this._app.unpause();
            $("#pauseButton").text("Pause");
        } else {
            this._app.pause();
            $("#pauseButton").text("Resume");
        }
    }

    private handleCancel(): void {
        const pauseButton = $("#pauseButton");
        pauseButton.text("Pause");
        pauseButton.prop("disabled", true);
        $("#cancelButton").prop("disabled", true);
        this._app.cancel();
    }

    public static handleFinish(): void {
        Ui.toggleUi(false);
        $("#restoreButton").prop("disabled", true);
    }

    private static handleClear(): void {
        $("#log").html("");
    }

    private static handleLoad(): void {
        try {
            const userAgent = localStorage.getItem("userAgent");
            if (userAgent !== null) {
                $("#userAgent").val(userAgent);
            }
            const rateLimit = localStorage.getItem("rateLimit");
            if (userAgent !== null) {
                $("#rateLimit").val(Number(rateLimit));
            }
            const mode = localStorage.getItem("mode");
            switch (mode) {
                case "0":
                    $("#modeLogin").prop("checked", true);
                    break;
                case "1":
                    $("#modeRestore").prop("checked", true);
                    break;
                case "2":
                    $("#modeAuto").prop("checked", true);
                    break;
            }
            const credentials = localStorage.getItem("credentials");
            if (credentials !== null) {
                $("#credentials").val(credentials);
            }
            const verbose = localStorage.getItem("verbose");
            if (verbose != null) {
                $("#verbose").prop(
                    "checked",
                    verbose === "true");
            }
        } catch {
            // No local storage
        }
    }

    private static handleSave(): void {
        try {
            localStorage.setItem("userAgent",
                                 String($("#userAgent").val()));
            localStorage.setItem("rateLimit",
                                 String($("#rateLimit").val()));
            localStorage.setItem("mode",
                                 String(Ui.getMode()));
            localStorage.setItem("credentials",
                                 String($("#credentials").val()));
            localStorage.setItem("verbose",
                                 String($("#verbose").is(":checked")));
        } catch {
            // No local storage
        }
    }

    private static handleClose(): void {
        if ($("#autoLoadSave").is(":checked")) {
            Ui.handleSave();
        }
    }

    private static getMode(): Mode {
        const loginModeInput = $("#modeLogin");
        const restoreModeInput = $("#modeRestore");
        const autoModeInput = $("#modeAuto");
        if (loginModeInput.is(":checked")) {
            return Mode.Login;
        } else if (restoreModeInput.is(":checked")) {
            return Mode.Restore;
        } else if (autoModeInput.is(":checked")) {
            return Mode.Auto;
        } else {
            throw new Error("No mode is checked");
        }
    }

    private static getCredentials(): Credential[] {
        const text = String($("#credentials").val());
        const credentials: Credential[] = [];
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
            // Ignore empty lines or lines just containing whitespace
            if (lines[i].trim() === "") {
                continue;
            }
            const tuple = lines[i].split(",");
            if (tuple.length !== 2) {
                throw new Error(
                    `Nation names and passwords text box does not`
                    + ` contain a single nation name and a single`
                    + ` password in the form 'nation,password' on`
                    + ` line ${i + 1}`);
            }
            credentials.push({nation: tuple[0], password: tuple[1]});
        }
        if (credentials.length === 0) {
            throw new Error(
                "You must specify at least one nation name and"
                + " password.");
        }
        return credentials;
    }
}
