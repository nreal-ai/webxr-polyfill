const { default: NRDevice } = require("../devices/NRDevice");

function WebVRPolyfill(config) {
    this.config = config;

    this.polyfillDisplays = [];
    // Store initial references to native constructors
    // and functions
    this.native = {};
    this.native.getVRDisplays = navigator.getVRDisplays;
    this.native.VRFrameData = window.VRFrameData;
    this.native.VRDisplay = window.VRDisplay;

    this.getVRDisplays().then(function (displays) {
        if (displays && displays[0] && displays[0].fireVRDisplayConnect_) {
            displays[0].fireVRDisplayConnect_();
        }
    });
}

WebVRPolyfill.prototype.getPolyfillDisplays = function () {
    if (this._polyfillDisplaysPopulated) {
        return this.polyfillDisplays;
    }

    this.polyfillDisplays.push(new NRDisplay());

    this._polyfillDisplaysPopulated = true;
    return this.polyfillDisplays;

}


WebVRPolyfill.prototype.enable = function () {
    // // Provide navigator.getVRDisplays.
    navigator.getVRDisplays = this.getVRDisplays.bind(this);

    // // Provide the `VRDisplay` object.
    // window.VRDisplay = CardboardVRDisplay.VRDisplay;

    // // Provide the VRFrameData object.
    // window.VRFrameData = CardboardVRDisplay.VRFrameData;
}



WebVRPolyfill.prototype.getVRDisplays = function () {
    return Promise.resolve(this.getPolyfillDisplays());
}
export default WebVRPolyfill;