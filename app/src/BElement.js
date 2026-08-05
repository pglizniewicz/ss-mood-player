import { render } from "lit-html";
import store from "./store.js";

/**
 * Base class for all custom elements: subscribes to the store, extracts a state
 * slice and renders the lit-html template returned by `view()`.
 */
export default class BElement extends HTMLElement {

    connectedCallback() {
        this.unsubscribe = store.subscribe(() => this.triggerViewUpdate());
        this.triggerViewUpdate();
    }

    disconnectedCallback() {
        this.unsubscribe?.();
    }

    triggerViewUpdate() {
        this.state = this.extractState(store.getState());
        // `host` makes lit-html bind `this` inside event handlers to the component rather than to
        // the element that received the event, so handlers can be plain methods.
        render(this.view(), this.getRenderTarget(), { host: this });
    }

    /**
     * @param {any} reduxState the entire store state
     * @returns {any} the slice this element renders
     */
    extractState(reduxState) {
        return reduxState;
    }

    getRenderTarget() {
        return this;
    }

    view() {
        throw new Error(`view() must be overridden by ${this.localName}`);
    }
}
