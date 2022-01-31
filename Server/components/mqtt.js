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
var mqttForPublicChannel = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../json_schemas/mqtt_for_PublicTasks_message_schema.json')).toString());

var tasks = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../json_schemas/task_schema.json')).toString());
var user = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../json_schemas/user_schema.json')).toString());
var serverMessage = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../json_schemas/schema_server_message.json')).toString());
var taskMessage = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../json_schemas/mqtt_task_message_schema.json')).toString());


var host = 'ws://localhost:8080';
var clientId = 'mqttjs_server' + Math.random().toString(16).substr(2, 8);
var options = {
  keepalive: 30,
  clientId: clientId,
  clean: true,
  reconnectPeriod: 5000, //1000 milliseconds, interval between two reconnections. Disable auto reconnect by setting to 0
  connectTimeout: 30*1000, //30 * 1000 milliseconds, time to wait before a CONNACK is received
  will: {
    topic: 'WillMsg',
    payload: 'ServerDisconnection',
    qos: 0,
    retain: false
  },
  rejectUnauthorized: false
};
var mqtt_connection = mqtt.connect(host, options);
var assignedPublicMap = new Map();
var taskMessageMap = new Map();

const validateTask = ajv.addSchema(user).compile(tasks)
const validatePublicMessage = ajv.compile(mqttForPublicIdTasksSchema)
const validateMessageForServer = ajv.compile(serverMessage)
const validateTaskMessage = ajv.compile(taskMessage)
const validatePublicChannelMessage = ajv.compile(mqttForPublicChannel)
//console.log(validateTask({description:"test"})) - good!


mqtt_connection.on('error', function (err) {
  console.log(err)
  //mqtt_connection.end()
})


//When the connection with the MQTT broker is established, a retained message for each task is sent
mqtt_connection.on('connect', function () {
  console.log('client connected:' + clientId)

  Assignments.getTaskSelections().then(function (selections) {
//    console.log(selections)
    selections.forEach(function(selection){


      if(selection.userName && !selection.private){
        //var status = (selection.userId) ? "active" : "inactive";
        //let information = new MQTTTaskMessage(status, selection.userId, selection.userName, selection.task)
        assignedPublicMap.set(selection.taskId, {userName: selection.userName, userId: selection.userId})
        
    
    Assignments.getGedPublicTaskAssignedSelected(selection.taskId).then((response)=>{
      
      let taskAssociated = {
        
          id: response.id,
          owner: response.owner,
          description: response.description,
          deadline: response.deadline,
          private: response.private?true:false,
          important: response.important?true:false,
          active: response.active,
          complete: response.completed?true:false
        
      }
      var message = new MQTTTaskMessage("active", selection.userId, selection.userName, taskAssociated );
      
      assignedPublicMap.set(selection.taskId, message)

  })
       
      
      }else if(!selection.private){
        var status = (selection.userId) ? "active" : "inactive";
        var message = new MQTTTaskMessage(status, selection.userId, selection.userName);
        taskMessageMap.set(selection.taskId, message);
        mqtt_connection.publish(String(selection.taskId), JSON.stringify(message), {qos:0, retain:true});
      }else{
        var status = (selection.userId) ? "active" : "inactive";
        var message = new MQTTTaskMessage(status, selection.userId, selection.userName);
        taskMessageMap.set(selection.taskId, message);
          mqtt_connection.publish(String(selection.taskId), JSON.stringify(message), {qos:1, retain:true});
      }
    });
    
    mqtt_connection.subscribe("ServerChannel", {qos:2, retain: true})
    mqtt_connection.subscribe("PublicChannel", {qos:1, retain: true})

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

    const tempMessage = validateMessageForServer(parsedMessage)

    if (tempMessage) {
        console.log("Valid message received from client!")

        if(parsedMessage.operation == "getPublicIds"){

          if(assignedPublicMap.size !== 0){
            for(const key of assignedPublicMap.keys()){
              var pubTaskAssigned = new MQTTTaskMessage(assignedPublicMap.get(key)["status"], assignedPublicMap.get(key)["userId"], assignedPublicMap.get(key)["userName"], assignedPublicMap.get(key)["task"] );
              mqtt_connection.publish(String(key), JSON.stringify(pubTaskAssigned), {qos:1, retain:true});
            }
          }
    
          Tasks.internalGetPublicTasks().then(function(response){
            response.forEach(function(singleTask){
              const tempValid = validateTask(singleTask)
              
              if (tempValid) {
                  console.log("----Valid Format Task----")

                  if(!assignedPublicMap.has(singleTask.id)){
                    let mess = new MQTTTaskMessage("insert", parsedMessage.clientId, null, singleTask)
                      const taskMessValid = validateTaskMessage(mess)
                      if(taskMessValid){
                        console.log("FORMAT MESSAGE FOR TASKS IS CORRECT, CAN BE SENT")
                        mqtt_connection.publish(String(singleTask.id), JSON.stringify(mess), {qos:1, retain:true})             
                      }else{
                        console.log("INVALID FORMAT MESSAGE TASK, CANNOT BE SENT    "+ ajv.errorsText(taskMessValid.errors))
                      }
                    }
              
              }else 
                  console.log("Invalid: " + ajv.errorsText(validateTask.errors))
                          
              })

              let tempArray = response.map(x=>x.id).sort((a,b)=> a.id<b.id?-1:1)
              message = new MQTTAllPublicIdTasksMessage("lastPublicIds", tempArray.length, tempArray)
              const valid = validatePublicMessage(message)
             
             if (valid){
                console.log("Valid Public Id Tasks Message To Send!")
                mqtt_connection.publish("CarryPublicIds", JSON.stringify(message), {qos:2, retain:false}) 
            
            }else
                console.log("Invalid Public Id Tasks Message To Send: " + ajv.errorsText(validatePublicMessage.errors))
      
                
          })
        }

       
    


    }
    
    
    
    else 
              console.log("Invalid message received from client: " + ajv.errorsText(validateMessageForServer.errors))





  }
  if(topic == "PublicChannel"){
    if(parsedMessage.status == "creation"){
      console.log("USER CREATION TASK")
      let task = parsedMessage.task;
      task.complete = 0;
      task.owner = parseInt(parsedMessage.userId);
      Tasks.addTask(task, parseInt(parsedMessage.userId))
  } 

  if(parsedMessage.status == "aggiorna"){
    console.log("USER UPDATE TASK")
    let task = parsedMessage.task;
    task.completed = 0;
    task.owner = parseInt(parsedMessage.userId);
    console.log(task)
    Tasks.updateSingleTask2(task, parseInt(task.id), parseInt(parsedMessage.userId))
  } 
  if(parsedMessage.status == "cancella"){
    console.log("USER DELETE TASK")
    let task = parsedMessage.task;
    Tasks.deleteTask(parseInt(task.id), parseInt(parsedMessage.userId))
} 
}
})


module.exports.publishTaskMessage = function publishTaskMessage(taskId, message, myretain) {
  if (typeof myretain == "boolean") {
    const taskMessValid = validateTaskMessage(message)
    if(taskMessValid){
      console.log("FORMAT **** MESSAGE FOR TASKS IS CORRECT, CAN BE SENT")
      mqtt_connection.publish(String(taskId), JSON.stringify(message), { qos: 0, retain:myretain})
    }else{
      console.log("INVALID **** FORMAT MESSAGE TASK, CANNOT BE SENT    "+ ajv.errorsText(taskMessValid.errors))
    }
  
  }else{

    const taskMessValid = validateTaskMessage(message)
    if(taskMessValid){
      console.log("FORMAT ------- MESSAGE FOR TASKS IS CORRECT, CAN BE SENT")
      mqtt_connection.publish(String(taskId), JSON.stringify(message), { qos: 0, retain:true})
    }else{
      console.log("INVALID ------- FORMAT MESSAGE TASK, CANNOT BE SENT    "+ ajv.errorsText(validateTaskMessage.errors))
    }

  }
};

module.exports.sendPublicChannel = function sendPublicChannel(mymess) {
  const pubChanMess = validatePublicChannelMessage(mymess)
    if(pubChanMess){
      console.log("FORMAT PUBLIC MESSAGE FOR TASKS IS CORRECT, CAN BE SENT")
      mqtt_connection.publish("PublicChannel", JSON.stringify(mymess), { qos: 1, retain:false })
    }else{
      console.log("INVALID PUBLIC FORMAT MESSAGE TASK, CANNOT BE SENT    "+ ajv.errorsText(validatePublicChannelMessage.errors))
    }





};

module.exports.saveAssignedPulickTask = function(taskId){
  Assignments.getGedPublicTaskAssignedSelected(taskId).then((response)=>{
    let taskSpeciale = {
      status: "active",
      task:{
        id: response.id,
        owner: response.owner,
        description: response.description,
        deadline: response.deadline,
        private: response.private?true:false,
        important: response.important?true:false,
        active: response.active,
        complete: response.completed?true:false
      },
      userId: response.userId,
      userName: response.userName
    }
    assignedPublicMap.set(taskId, taskSpeciale)


  })

}

module.exports.deleteAssignedPulickTask = function(taskId){
  assignedPublicMap.delete(taskId)
}


module.exports.saveMessage = function saveMessage(taskId, message) {
    taskMessageMap.set(taskId, message);
};

module.exports.getMessage = function getMessage(taskId) {
    taskMessageMap.get(taskId);
};

module.exports.deleteMessage = function deleteMessage(taskId) {
    taskMessageMap.delete(taskId);
};


