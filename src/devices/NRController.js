import GamepadXRInputSource from "./GamepadXRInputSource";



export default class NRController extends GamepadXRInputSource{


    constructor(polyfill,primaryButtonIndex = 0, primarySqueezeButtonIndex = -1){
        super(polyfill,{},primaryButtonIndex,primarySqueezeButtonIndex);

        this.controllerData = null;
    }

    updateControllerData(controllerData){

        

    }
}