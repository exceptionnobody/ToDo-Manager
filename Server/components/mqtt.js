'use strict'

var mqtt = require('mqtt');
var Assignments = require('../service/AssignmentsService');
var Tasks = require('../service/TasksService.js');
var MQTTTaskMessage = require('./mqtt_task_message.js');
var MQTTAllPublicIdTasksMessage = require('./mqtt_all_public_id_tasks');

// TEST
var message;
var fs = require("fs");
var path = require('path');
const Ajv = require("ajv")
const ajv = new Ajv({allErrors: true})
var mqttForPublicIdTasksSchema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../json_schemas/mqtt_for_CarryPublicIds_message_schema.json')).toString());
var tasks = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../json_schemas/task_schema.json')).toString());
var user = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../json_schemas/user_schema.json')).toString());


var host = 'ws://localhost:8080';
var clientId = 'mqttjs_server' + Math.random().toString(16).substr(2, 8);
var options = {
  keepalive: 30,
  clientId: clientId,
  clean: true,
  reconnectPeriod: 5000, //1000 milliseconds, interval between two reconnections. Disable auto reconnect by setting to 0
  connectTimeout: 30*1000, //30 * 1000 milliseconds, time to wait before a CONNACK is received
  will: {
    topic: 'ErrorHandling',
    payload: 'ServerDisconnection',
    qos: 0,
    retain: false
  },
  rejectUnauthorized: false
};
var mqtt_connection = mqtt.connect(host, options);

var taskMessageMap = new Map();

const validateTask = ajv.addSchema(user).compile(tasks)
const validatePublicMessage = ajv.compile(mqttForPublicIdTasksSchema)
console.log(validateTask({description:"trallaleru"}))


mqtt_connection.on('error', function (err) {
  console.log(err)
  console.log("Sono qui")
  //mqtt_connection.end()
})


//When the connection with the MQTT broker is established, a retained message for each task is sent
mqtt_connection.on('connect', function () {
  console.log('client connected:' + clientId)

  Assignments.getTaskSelections().then(function (selections) {
    console.log(selections)
    selections.forEach(function(selection){
      var status = (selection.userId) ? "active" : "inactive";
      var message = new MQTTTaskMessage(status, selection.userId, selection.userName);
      taskMessageMap.set(selection.taskId, message);
      if(!selection.private)
          mqtt_connection.publish(String(selection.taskId), JSON.stringify(message), {qos:1, retain:true});
      else{
          mqtt_connection.publish(String(selection.taskId), JSON.stringify(message), {qos:0, retain:true});
      }
    });
    
    mqtt_connection.subscribe("ServerChannel", {qos:2, retain: true})
  }) .catch(function (error) {
    mqtt_connection.end();
  })
 
})

mqtt_connection.on('close', function () {
  console.log(clientId + ' disconnected');
  console.log("I TRY TO RECONNECT WITH THE BROKER")
})


mqtt_connection.on('message', function (topic, message) {
  var parsedMessage = JSON.parse(message);
  if(topic == "ServerChannel"){
    if(parsedMessage.operation == "getPublicIds"){
      Tasks.internalGetPublicTasks().then(function(response){
        response.forEach(function(singleTask){
          const tempValid = validateTask(singleTask)
          
          if (tempValid) 
              console.log("Valid To send!")
          else 
              console.log("Invalid: " + ajv.errorsText(validateTask.errors))
          
          mqtt_connection.publish(String(singleTask.id), JSON.stringify(new MQTTTaskMessage("insert", parsedMessage.clientId, null, singleTask)), {qos:1, retain:true})
        })

          let tempArray = response.map(x=>x.id).sort((a,b)=> a.id<b.id?-1:1)
          message = new MQTTAllPublicIdTasksMessage("lastPublicIds", tempArray.length, tempArray)
          const valid = validatePublicMessage(message)
         
         if (valid)
            console.log("Valid Public Message To send!")
         else 
            console.log("Invalid: " + ajv.errorsText(validatePublicMessage.errors))
  
          mqtt_connection.publish("CarryPublicIds", JSON.stringify(message), {qos:2, retain:false})
            
      })
    }

  } 
})


module.exports.publishTaskMessage = function publishTaskMessage(taskId, message, myretain) {
  console.log(typeof myretain == "boolean")
  if (typeof myretain == "boolean") {
    mqtt_connection.publish(String(taskId), JSON.stringify(message), { qos: 0, retain:myretain})
  }else{
    mqtt_connection.publish(String(taskId), JSON.stringify(message), { qos: 0, retain:true})

  }
};

module.exports.sendPublicChannel = function sendPublicChannel(mymess) {
  console.log(mymess)
  mqtt_connection.publish("PublicChannel", JSON.stringify(mymess), { qos: 1, retain:false })

};

module.exports.saveMessage = function saveMessage(taskId, message) {
    taskMessageMap.set(taskId, message);
};

module.exports.getMessage = function getMessage(taskId) {
    taskMessageMap.get(taskId);
};

module.exports.deleteMessage = function deleteMessage(taskId) {
    taskMessageMap.delete(taskId);
};


