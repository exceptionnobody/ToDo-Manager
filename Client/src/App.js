import { React, useState, useEffect } from 'react';

import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import API from './API'

import { Container, Row, Col, Button, Toast } from 'react-bootstrap/';


import Navigation from './components/Navigation';
import Filters from './components/Filters';
import ContentList from './components/ContentList';
import PublicList from './components/PublicList';
import ModalForm from './components/ModalForm';
import { LoginForm } from './components/Login';
import Assignments from './components/Assignments';
import OnlineList from './components/OnlineList';
import MiniOnlineList from './components/MiniOnlineList';
import ReconnectingWebSocket from 'reconnecting-websocket'
import { Route, useRouteMatch, useHistory, Switch, Redirect, BrowserRouter as Router } from 'react-router-dom';


import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import { parse } from 'path';
import { createConnection } from 'net';

import MQTTTaskMessage from './utils/mqtt_task_message'

dayjs.extend(isToday);

const EventEmitter = require('events');
const handler = new EventEmitter();

const url = 'ws://localhost:5000'
var ws = new WebSocket(url)

var mqtt = require('mqtt')
var clientId = 'mqttjs_' + Math.random().toString(16).substr(2, 8)
var options = {
  keepalive: 30,
  clientId: clientId,
  clean: true,
  reconnectPeriod: 15000,
  connectTimeout: 30 * 1000,
  will: {
    topic: 'WillMsg',
    payload: 'Connection Closed abnormally..!',
    qos: 0,
    retain: false
  },
  rejectUnauthorized: false
}
var host = 'ws://127.0.0.1:8080'
var client = mqtt.connect(host, options);
var PublicMap = new Map()
var OwnTasksMaps = new Map()
var AssignedTasksMap = new Map()
var AssignedAndPublicTaskMaps = new Map() 
var temp = []
var index;
var TestLista = new Map()
var totalPublicPages;
var totalPublicItems;
var numOfConnection = 1;

var constants = Object.freeze({
  OFFSET: 10,
});

var numMessage=0;

const App = () => {

  // Need to place <Router> above the components that use router hooks
  return (
    <Router>
      <Main></Main>
    </Router>
  );

}

const Main = () => {

  // This state is an object containing the list of tasks, and the last used ID (necessary to create a new task that has a unique ID)
  const [taskList, setTaskList] = useState([]);
  const [OwnedTaskList, setOwnedTaskList] = useState([]);
  const [userList, setUserList] = useState([]);
  const [onlineList, setOnlineList] = useState([]);
  const [assignedTaskList, setAssignedTaskList] = useState([]);
  const [dirty, setDirty] = useState(true);

  const MODAL = { CLOSED: -2, ADD: -1 };
  const [selectedTask, setSelectedTask] = useState(MODAL.CLOSED);

  const [message, setMessage] = useState('');

  const [loggedIn, setLoggedIn] = useState(false); // at the beginning, no user is logged in
  const [user, setUser] = useState(null);

  const [pubTasks, setPubTasks] = useState([])
  // active filter is read from the current url
  const match = useRouteMatch('/list/:filter');
  const activeFilter = (match && match.params && match.params.filter) ? match.params.filter : 'owned';

  const [errorType, setErrorType] = useState({type:'', msg:''})
  const [filtroTemporaneo, setFiltroTemporaneo ] = useState(activeFilter)
  const history = useHistory();
  // if another filter is selected, redirect to a new view/url
  const handleSelectFilter = (filter) => {
    history.push("/list/" + filter);
  }

  const handleSelectFilter2 = (filter) => {
    setFiltroTemporaneo(filter)
    history.push("/list/" + filter);
    localStorage.setItem("currentPage", '1')
  }



  function forManagingWebSocketConnection(){

    var socket = new ReconnectingWebSocket(url, null, {debug: true, maxReconnectionDelay: 3000, maxRetries:25, connectionTimeout:7000});

    socket.reconnect(400,"test");

    socket.addEventListener('open', () => {
      alert('hello!');
    });

    socket.addEventListener('message', function (event) {
      console.log('Message from server ', event.data);
      try {
        messageReceived(event);
      } catch (error) {
        console.log(error);
      }
      
  });

  socket.addEventListener('close', (event) => {
    console.log('The connection has been closed successfully.');
  });
  socket.addEventListener('error', function (event) {
    console.log('WebSocket error: ', event);
  });
  }

  function initSocket() {
    ws = new WebSocket(url);
  
    ws.onopen = () => {
        console.log('connected');
        //retries=0;
    };
  
    ws.onclose = () => {
        /*console.error('disconnected.');
        retries++;
        if (retries<5) {
            console.log('trying to reconnect');
            setTimeout(initSocket, 1000);
        }
        else {
            console.log('Maximum number of reconnect reached');
            disconnectedMode();
        }*/
        console.log("I am trying to use ReconnectWebsocket")
        forManagingWebSocketConnection()
    };
  
    ws.onerror = error => {
        console.error('failed to connect or other error.', error);
        ws.close();
    };
  
    ws.onmessage = (e) => {
      try {
        messageReceived(e);
      } catch (error) {
        console.log(error);
      }
  
    }
  
  }
  
  
  function disconnectedMode () {
    console.error('disconnected mode.');
    alert("You are in disconnected mode. Reload page to retry.");
  }

  useEffect(() => {


    //MQTT management

    client.on('error', function (err) {
      console.log(err)
      console.log("Sono nell'errore... ")
      client.end()
    })

    client.on('connect', function () {
      console.log('client connected:' + clientId)
      if(numOfConnection === 1){
      
        client.publish("ServerChannel", JSON.stringify({operation:"getPublicIds", clientId:clientId}),{qos:2, retain:true})
        client.subscribe("CarryPublicIds", { qos: 2, retain: true })
        localStorage.setItem("currentPublicPage", '1')
      }else{
        alert("Connection re-establish again")
        // then I can perform the same operations
        client.publish("ServerChannel", JSON.stringify({operation:"getPublicIds", clientId:clientId}),{qos:2, retain:true})
        client.subscribe("CarryPublicIds", { qos: 2, retain: false })
        
        localStorage.setItem("currentPublicPage", '1')

        if(loggedIn){
          refreshTasks(filtroTemporaneo, 1)
          setUser(user)
        }
        numOfConnection=1;

      }
    })

    client.on('reconnect', function () {
      console.log('Reconnecting...')
      alert("We are trying to re-establish the connection again. Tasks could not be up to date!")
    })

    client.on('message', function (topic, messageBroker) {
      try {
        var parsedMessage = JSON.parse(messageBroker);

        if (topic != "PublicChannel" && topic != "CarryPublicIds") {
          
          if (parsedMessage.status == "deleted" || parsedMessage.status == "changed"){
            removeOrDeletePublicTasks(topic, parsedMessage)
            displayTaskSelection(topic, parsedMessage);
            if(loggedIn){
              OwnTasksMaps.delete(parseInt(topic))
              let temporalState =  ([...OwnTasksMaps.values()].filter((item) => item.id !== parseInt(topic))).sort((a,b)=>parseInt(a.id)<parseInt(b.id)?-1:1)
              let totalPages= Math.ceil(temporalState.length / constants.OFFSET);
              let totalItems = temporalState.length;
              localStorage.setItem('totalPages',totalPages.toString());
              localStorage.setItem('totalItems',totalItems.toString());
              
              if(totalItems%constants.OFFSET){
                let pageNumber = Number(localStorage.getItem('currentPage'))
                setTaskList(temporalState.filter((x,j)=> {if(j>=(pageNumber-1)*constants.OFFSET && j < (pageNumber)*constants.OFFSET) return x}))
                refreshTasks(filtroTemporaneo, pageNumber)
              }else{
                  let num = Number(localStorage.getItem('currentPage'))
                  if(num > 1){
                    num-=1
                    localStorage.setItem('currentPage', String(num))
                    setTaskList(temporalState.filter((x,j)=> (j>=(num-1)*constants.OFFSET && j < (num)*constants.OFFSET)))
                    refreshTasks(filtroTemporaneo, num)

                  }else{
                    
                    localStorage.setItem('currentPage', String(num))
                    setTaskList(temporalState.filter((x,j)=> (j>=(num-1)*constants.OFFSET && j < (num)*constants.OFFSET) ))
                    refreshTasks(filtroTemporaneo, num)

                  }
              }
            }
          } 
          
          if (parsedMessage.status == "active" || parsedMessage.status == "inactive"){

           displayTaskSelection(topic, parsedMessage);

          if(parsedMessage.task){

            AssignedAndPublicTaskMaps.set(parseInt(topic), parsedMessage)
            client.subscribe(String(topic), {qos:1, retain: true})
            PublicMap.set(parseInt(topic), parsedMessage["task"])
            addPublicTask(parsedMessage.task, "insert")

             }
             
           
          }

        if (parsedMessage.status == "update"){
            
            aggiornaTasks(topic, parsedMessage);

            if(loggedIn)
              displayTaskSelection(topic, parsedMessage);
          }
          
          if (parsedMessage.status == "insert" && parsedMessage.userId == clientId){

            addPublicTask(parsedMessage.task, "insert")
            displayTaskSelection(topic, parsedMessage.task)
            if(loggedIn){
              console.log("Vediamo che sputa: ",parsedMessage["tasks"]["id"])
              OwnTasksMaps.set(parsedMessage["tasks"].id, parsedMessage["task"])
             let newArray = [...OwnTasksMaps.values()].sort((a,b)=>parseInt(a.id) < parseInt(b.id) ? -1:1)
             let totalPages= Math.ceil(newArray.length / constants.OFFSET);
             let totalItems = newArray.length;
   
           let oldTotalPages = localStorage.getItem('totalPages')
   
           localStorage.setItem('totalItems',totalItems.toString());
   
            let pageNumber = Number(localStorage.getItem('currentPage'))

   if(oldTotalPages == totalPages){
    setTaskList(newArray.filter((x,j)=> {if(j>=(pageNumber-1)*constants.OFFSET && j < (pageNumber)*constants.OFFSET) return x}))
           refreshTasks(filtroTemporaneo, pageNumber)
   }else{
     localStorage.setItem('totalItems',totalItems.toString());
     setTaskList(newArray.filter((x,j)=> {if(j>=(pageNumber-1)*constants.OFFSET && j < (pageNumber)*constants.OFFSET) return x}))

         refreshTasks(filtroTemporaneo, pageNumber+1)
   }

           }

          }

        } else {

          // gestione dei canali 

          if(topic == "PublicChannel"){
            if (parsedMessage.type == "subscribe"){
              client.subscribe(String(parsedMessage.id), { qos: 1, retain: true })
              
              addPublicTask(parsedMessage,"subscribe")
              if(loggedIn)  
                displayTaskSelection(topic, parsedMessage.task)
  


            }
          }

          if(topic == "CarryPublicIds"){
            if(parsedMessage.type == "lastPublicIds"){
              client.unsubscribe("CarryPublicIds")
              totalPublicPages= Math.ceil( parseInt(parsedMessage.number)/constants.OFFSET);

              for(const task of parsedMessage.taskList)
                if(!PublicMap.has(parseInt(task)))
                  client.subscribe(String(task), {qos:1, retain:true})

              localStorage.setItem('totalPublicPages',  String(totalPublicPages));
              localStorage.setItem('totalPublicItems',  String(parsedMessage.number));
              localStorage.setItem("currentPublicPage", '1');
              client.subscribe("PublicChannel", { qos: 1, retain: false }) 

            }

          }
          

        }
      } catch (e) {
        console.log(e);
      }
    })

    client.on('close', function () {
      
      //setErrorType()
      console.log(clientId + ' disconnected');
      if(numOfConnection==1){
        alert("Connection lost, server not reachable")
        numOfConnection+=1;
      }
      
    })


    //WebSocket management
    ws.onopen = () => {
      ws.send('Message From Client');
      setOnlineList([]);
    }

    ws.onerror = (error) => {
      console.log(`WebSocket error: ${error}`);
    }

    ws.onclose = function (event) {
     // numOfConnection+=1;

      alert('(WebSocket)Server not reachable, public tasks not update! We are trying to reconnect... wait.');

      setTimeout(initSocket, 1000);

    };

    ws.onmessage = (e) => {
      try {
        messageReceived(e);
      } catch (error) {
        console.log(error);
      }

    }

    // check if user is authenticated
    const checkAuth = async () => {
      try {
        // here you have the user info, if already logged in
        const authenticated = await API.getUserInfo();
        if (authenticated) {
          //setUser();
          setLoggedIn(true);
        } else {
          console.log('error');
        }

      } catch (err) {
        console.log(err.error); // mostly unauthenticated user
      }
    };
    checkAuth();
  }, []);


  // set dirty to true only if acfiveFilter changes, if the active filter is not changed dirty = false avoids triggering a new fetch
  useEffect(() => {
    setDirty(true);
  }, [filtroTemporaneo])


  function addPublicTask(messageBroker, typeMess) {
    if(typeMess == "insert")
      PublicMap.set(parseInt(messageBroker.id), messageBroker)
    else
      PublicMap.set(parseInt(messageBroker.id), messageBroker.task)

    let newArray = [...PublicMap.values()].sort((a,b)=>parseInt(a.id) < parseInt(b.id) ? -1:1)
    totalPublicPages= Math.ceil(newArray.length / constants.OFFSET);
    totalPublicItems = newArray.length;
    
    let oldTotalPublicPages = localStorage.getItem('totalPublicPages')
    
    localStorage.setItem('totalPublicItems',totalPublicItems.toString());
    
    let pageNumber = Number(localStorage.getItem('currentPublicPage'))

    if(oldTotalPublicPages == totalPublicPages){
      setPubTasks(newArray.filter((x,j)=> {if(j>=(pageNumber-1)*constants.OFFSET && j < (pageNumber)*constants.OFFSET) return x}))
    }else{
      localStorage.setItem('totalPublicPages',totalPublicPages.toString());
      setPubTasks(newArray.filter((x,j)=> {if(j>=(pageNumber-1)*constants.OFFSET && j < (pageNumber)*constants.OFFSET) return x}))
    }

  }

  function removeOrDeletePublicTasks(topic, mess) {

    if(mess.status == "changed"){
      if(!OwnTasksMaps.has(parseInt(topic)))
         client.unsubscribe(String(topic))
    }else{
        client.unsubscribe(String(topic))
    }
    if(PublicMap.has(parseInt(topic))){
    PublicMap.delete(parseInt(topic))
    let temporalState =  ([...PublicMap.values()].filter((item) => item.id !== parseInt(topic))).sort((a,b)=>parseInt(a.id)<parseInt(b.id)?-1:1)
    totalPublicPages= Math.ceil(temporalState.length / constants.OFFSET);
    totalPublicItems = temporalState.length;
    localStorage.setItem('totalPublicPages',totalPublicPages.toString());
    localStorage.setItem('totalPublicItems',totalPublicItems.toString());
    
    if(totalPublicItems%constants.OFFSET){
      let pageNumber = Number(localStorage.getItem('currentPublicPage'))
      setPubTasks(temporalState.filter((x,j)=> {if(j>=(pageNumber-1)*constants.OFFSET && j < (pageNumber)*constants.OFFSET) return x}))
    }else{
        let num = Number(localStorage.getItem('currentPublicPage'))
        if(num > 1){
          num-=1
          localStorage.setItem('currentPublicPage', String(num))
          setPubTasks(temporalState.filter((x,j)=> (j>=(num-1)*constants.OFFSET && j < (num)*constants.OFFSET)))
        }else{
          
          localStorage.setItem('currentPublicPage', String(num))
          setPubTasks(temporalState.filter((x,j)=> (j>=(num-1)*constants.OFFSET && j < (num)*constants.OFFSET) ))
        }
    }
  }
  }

  function aggiornaTasks(topic, messageBroker) {
  
    if(!messageBroker.task["private"]){
      PublicMap.set(parseInt(topic), messageBroker.task)
      setPubTasks(oldstate => {
        return oldstate.map((item) => {

        if (item.id == parseInt(topic))
          return { ...messageBroker.task }
        else
          return item
      })
    })
  }else{
      setTaskList(oldstate => {

            return  oldstate.map((item) => {

                    if (item.id == parseInt(topic))
                       return messageBroker.task
                    else
                       return item
                   })
        
      })
    }
}

  const displayTaskSelection = (topic, parsedMessage) => {
    handler.emit(topic, parsedMessage);

    index = temp.findIndex(x => x.taskId == parseInt(topic));
    let objectStatus = { taskId: topic, userName: parsedMessage.userName, status: parsedMessage.status };

    if(index === -1){
      temp.push(objectStatus)
      setAssignedTaskList(temp)
    }else{
      temp[index] = objectStatus
      setAssignedTaskList(temp)
    }
  
    
      setDirty(true)
  }

 const messageReceived = function(event) {
    let datas = JSON.parse(event.data.toString());
    if (datas.typeMessage == "login") {

      if(!TestLista.has(datas.userId)){

        TestLista.set(datas["userId"], datas)
        let test = [...TestLista.values()].sort((a, b) => {
          let fa = a.userName.toLowerCase();
          let fb = b.userName.toLowerCase();

          if (fa < fb) {
            return -1;
          }
          if (fa > fb) {
            return 1;
          }
          return 0;
        })
      
        setOnlineList(test)
      
    }
    }

       
    if (datas.typeMessage == "logout") {

      
        if (TestLista.has(datas.userId)) {
          TestLista.delete(datas.userId);
        }
        
        let test = [...TestLista.values()];
     
        setOnlineList(test.sort((a, b) => {
                  let fa = a.userName.toLowerCase();
                  let fb = b.userName.toLowerCase();

                  if (fa < fb) {
                    return -1;
                  }
                  if (fa > fb) {
                    return 1;
                  }
                  return 0;
        }))
 
      
      }

      if (datas.typeMessage == "update") {

        
      TestLista.set(datas.userId, datas);
      let test = [...TestLista.values()]  

      setOnlineList(test.sort((a, b) => {
        let fa = a.userName.toLowerCase();
        let fb = b.userName.toLowerCase();

        if (fa < fb) {
          return -1;
        }
        if (fa > fb) {
          return 1;
        }
        return 0;
      }))
          
          
    
      }
      setDirty(true);
}


  const deleteTask = (task) => {
    if(task.private)
      API.deleteTask(task)
        .then(() =>{ 
       OwnTasksMaps.delete(task.id)
        setDirty(true)})
        .catch(e => handleErrors(e))
      else{
        client.publish("PublicChannel", JSON.stringify(new MQTTTaskMessage("cancella", user.id, user.userName, task)), {qos:1, retain:false})
        
        refreshTasks(filtroTemporaneo)
      }
  }

  const completeTask = (task) => {
    API.completeTask(task)
      .then(() => { setDirty(true) })
      .catch(e => handleErrors(e))
  }


  const findTask = (id) => {
    return taskList.find(t => t.id === id);
  }

  const getInitialTasks = function(){
    if (loggedIn) {
      API.getTasks('owned')
        .then(tasks => {
          for (const element of tasks) {
            if (!OwnTasksMaps.has(element.id) && !PublicMap.has(element.id)) {
              client.subscribe(String(element.id), { qos: 0, retain: true });
              OwnTasksMaps.set(element.id, element)
             }
          }
          setTaskList(tasks);
          setFiltroTemporaneo("owned")
        })
        .catch(e => handleErrors(e));
    }
  }

  const getPublicTasks = () => {
     
    let newTempArray = [...PublicMap.values()].sort((a,b)=>a.id<b.id?-1:1)
    totalPublicPages= Math.ceil(newTempArray.length / constants.OFFSET);
    localStorage.setItem("totalPublicPages",String(totalPublicPages));
    localStorage.setItem("totalPublicItems", String(newTempArray.length))
      
    setPubTasks(newTempArray.filter((_,temindex)=>(temindex>=0&&temindex<constants.OFFSET )))
        
  }

  const getAllOwnedTasks = () => {

    API.getAllOwnedTasks()
      .then(tasks => {
        setOwnedTaskList(tasks);
      })
      .catch(e => handleErrors(e));
  }

  const getUsers = () => {
      API.getUsers()
        .then(users => {
          setUserList(users);
        })
        .catch(e => handleErrors(e));
    }

  const refreshTasks = (filter, page) => {
    
    API.getTasks(filter, page)
      .then(tasks => {
        if(filter == "owned"){
          for (const element of tasks) {
            if (!OwnTasksMaps.has(element.id) && !PublicMap.has(element.id)) {
              client.subscribe(String(element.id), { qos: 1, retain: true });
              OwnTasksMaps.set(element.id, element)
            }
          }
          setOwnedTaskList(tasks);
        }else{
          for (const element of tasks) {
            if (!AssignedAndPublicTaskMaps.has(element.id)&&!PublicMap.has(element.id)) {
              client.subscribe(String(element.id), { qos: 1, retain: true });
              AssignedAndPublicTaskMaps.set(element.id, element)
            }
          }

        }
        setTaskList(tasks);
        
        setDirty(false);
      })
      .catch(e => handleErrors(e));
    
  }

  const refreshPublic = (page) => {
   
      let newTempArray = [...PublicMap.values()].sort((a,b)=>a.id<b.id?-1:1)
      totalPublicPages= Math.ceil(PublicMap.size / constants.OFFSET);
      totalPublicItems = PublicMap.size;
      localStorage.setItem('totalPublicPages',  totalPublicPages.toString());
      localStorage.setItem('totalPublicItems',  totalPublicItems.toString());
      if(page >= 1 && page <= Number(localStorage.getItem('totalPublicPages'))){
        
        localStorage.setItem('currentPublicPage',page.toString());
        let pageNumber = parseInt(page)
        setPubTasks(newTempArray.filter((_,tempIndex)=> (tempIndex >= ((pageNumber-1)*constants.OFFSET) && tempIndex < ((pageNumber)*constants.OFFSET)) ))
      }
  }

  const assignTask = (userId, tasksId) => {
    for (const taskId of tasksId) {
      API.assignTask(Number(userId), taskId).catch(e => handleErrors(e));
    }
  }

  const removeAssignTask = (userId, tasksId) => {
    for (const taskId of tasksId) {
      API.removeAssignTask(Number(userId), taskId).catch(e => handleErrors(e));
    }
  }

  const selectTask = (task) => {
    API.selectTask(task)
      .then(() => {
        setDirty(true)
      })
      .catch(e => { alert('Task is already active for another user!'); handleErrors(e); })
  }


  useEffect(() => {
    if (loggedIn && dirty) {
      API.getTasks(filtroTemporaneo, localStorage.getItem('currentPage'))
        .then(tasks => {
          if(filtroTemporaneo == "owned"){
            for (const element of tasks) {
              /*if (!OwnTasksMaps.has(element.id) && !PublicMap.has(element.id) && !AssignedAndPublicTaskMaps.has(element.id)) {
              client.subscribe(String(element.id), { qos: 1, retain: true });
              OwnTasksMaps.set(element.id, element)
              }*/
              if (!OwnTasksMaps.has(element.id)) {
                client.subscribe(String(element.id), { qos: 1, retain: true });
                OwnTasksMaps.set(element.id, element)
                }
          }        

          setDirty(false);
          setTimeout(setTaskList, 200, tasks);
          }else{


            for (const element of tasks) {
              if(!AssignedTasksMap.has(element.id)  && !PublicMap.has(element.id) && !AssignedAndPublicTaskMaps.has(element.id)) {
              client.subscribe(String(element.id), { qos: 1, retain: true });
              AssignedTasksMap.set(element.id, element)
              }
            }

              setDirty(false);
              setTimeout(setTaskList, 200, tasks);
          }
          
        })
        .catch(e => handleErrors(e));
    }
  }, [filtroTemporaneo, dirty, loggedIn, user])

  // show error message in toast
  const handleErrors = (err) => {
    setMessage({ msg: err.error, type: 'danger' });
    console.log(err);
  }


  // add or update a task into the list
  const handleSaveOrUpdate = (task) => {

    // if the task has an id it is an update
    if (task.id) {
     if(task.private) 
      API.updateTask(task)
        .then(response => {
          if (response.ok) {
            OwnTasksMaps.set(task.id, task)
            API.getTasks(filtroTemporaneo, localStorage.getItem('currentPage'))
              .then(tasks => {
                for (const element of tasks) {
                  if (!OwnTasksMaps.has(element.id)) {
                    client.subscribe(String(element.id), { qos: 0, retain: true });
                    OwnTasksMaps.set(element.id, element)
                   }
                }
                setTaskList(tasks);
              }).catch(e => handleErrors(e));
          }
        }).catch(e => handleErrors(e));
       else 
           client.publish("PublicChannel", JSON.stringify(new MQTTTaskMessage("aggiorna", user.id, user.userName, task)), {qos:1, retain:false})
          setDirty(true)
           // otherwise it is a new task to add
    } else {
      if(task.private)
        API.addTask(task)
        .then(() => {
          setDirty(true)})
        .catch(e => handleErrors(e));

        console.log("creo il task con mqtt")
        
        client.publish("PublicChannel", JSON.stringify(new MQTTTaskMessage("creation", parseInt(user.id), user.userName, task)), {qos:1, retain:false})
        setDirty(true)
      }
      setSelectedTask(MODAL.CLOSED);
  }

  const handleEdit = (task) => {
    setSelectedTask(task.id);
  }

  const handleClose = () => {
    setSelectedTask(MODAL.CLOSED);
  }

  const doLogIn = async (credentials) => {
    try { 
      const LoggedUser = await API.logIn(credentials);
      setUser(LoggedUser);
      setLoggedIn(true);
    }
    catch (err) {
      // error is handled and visualized in the login form, do not manage error, throw it
      throw err;
    }
  }



    // handle change event
  const handlePageChange = pageNumber => {
    refreshTasks(filtroTemporaneo, pageNumber);
  }


  const handleLogOut = async () => {
    // clean up everything

    if(OwnTasksMaps.size !== 0){
      for(const val of OwnTasksMaps.values()){
        client.unsubscribe(String(val.id))
      }
     }

    OwnTasksMaps.clear()
    TestLista.clear()
    setLoggedIn(false);
    setAssignedTaskList([])
    setUser(null);
    setTaskList([]);
    setDirty(true);
    setFiltroTemporaneo("owner");

    await API.logOut()
    localStorage.removeItem('totalPages');
    localStorage.removeItem("totalItems");
    localStorage.removeItem("currentPage");
    localStorage.setItem("currentPublicPage", '1');
    localStorage.removeItem('userId');
    localStorage.removeItem('email');
    localStorage.removeItem('username');
    
  }


  return (

    <Container fluid>
      <Row>
        <Navigation onLogOut={handleLogOut} loggedIn={loggedIn} user={user} getPublicTasks={getPublicTasks} getInitialTasks={getInitialTasks} />
      </Row>

      <Toast show={message != ''} onClose={() => setMessage('')} delay={5000} autohide>
        <Toast.Body>{message.msg}</Toast.Body>
      </Toast>

      <Switch>
        <Route path="/login">
          <Row className="vh-100 below-nav">
            {loggedIn ? <Redirect to="/" /> : <LoginForm login={doLogIn} />}
          </Row>
        </Route>


        <Route path="/public">
          <Row className="vheight-100">
            <Col sm={3} bg="light" className="d-block col-4" id="left-sidebar">
              <span>&nbsp;&nbsp;</span>
              {loggedIn && <MiniOnlineList onlineList={onlineList} />}
            </Col>
            <Col className="col-8">
              <Row className="vh-100 below-nav">
                <PublicMgr publicList={pubTasks} refreshPublic={refreshPublic}></PublicMgr>
              </Row>
            </Col>
          </Row>
        </Route>

        <Route path="/online">
          <Row className="vheight-100">
            <Col sm={3} bg="light" className="d-block col-4" id="left-sidebar">
              <span>&nbsp;&nbsp;</span>
              {loggedIn && <MiniOnlineList onlineList={onlineList} />}
            </Col>
            <Col sm={8} className="below-nav">
              <h5><strong>Online Users</strong></h5>
              <div className="user">
                <OnlineList usersList={onlineList} ws={ws} />
              </div>
            </Col>
          </Row>
        </Route>

        <Route path="/assignment">
          {loggedIn ?
            <Row className="vheight-100">
              <Col sm={3} bg="light" className="d-block col-4" id="left-sidebar">
                <span>&nbsp;&nbsp;</span>
                <MiniOnlineList onlineList={onlineList} />
              </Col>
              <Col sm={8} bg="light" id="left-sidebar" className="collapse d-sm-block below-nav">
                <Assignments  OwnedTaskList={OwnedTaskList} getAllOwnedTasks={getAllOwnedTasks} UserList={userList} getUsers={getUsers} assignTask={assignTask} removeAssignTask={removeAssignTask}/>
              </Col>
            </Row>
            : <Redirect to="/login" />
          } </Route>

        <Route path={["/list/:filter"]}>
          {loggedIn ?
            <Row className="vh-100 below-nav">
              <TaskMgr taskList={taskList} filter={filtroTemporaneo} onDelete={deleteTask} onEdit={handleEdit} onComplete={completeTask} onCheck={selectTask} onSelect={handleSelectFilter2} handlePageChange={handlePageChange} onlineList={onlineList} myhandler={handler} assignedTaskList={assignedTaskList}></TaskMgr>
              <Button variant="success" size="lg" className="fixed-right-bottom" onClick={() => setSelectedTask(MODAL.ADD)}>+</Button>
              {(selectedTask !== MODAL.CLOSED) && <ModalForm task={findTask(selectedTask)?findTask(selectedTask):null} onSave={handleSaveOrUpdate} onClose={handleClose}></ModalForm>}
            </Row> : <Redirect to="/login" />
          }
        </Route>
        <Route>
          <Redirect to="/list/owned" />
        </Route>
      </Switch>
    </Container>

  );

}


const TaskMgr = (props) => {

  const { taskList, filter, onDelete, onEdit, onComplete, onCheck, onSelect, handlePageChange, onlineList, myhandler, assignedTaskList } = props;

  // ** FILTER DEFINITIONS **
  const filters = {
    'owned': { label: 'Owned Tasks', id: 'owned' },
    'assigned': { label: 'Assigned Tasks', id: 'assigned' }
  };

  // if filter is not know apply "all"
  const activeFilter = (filter && filter in filters) ? filter : 'owned';

  return (
    <>
      <Col sm={3} bg="light" className="d-block col-4" id="left-sidebar">
        <Filters items={filters} defaultActiveKey={activeFilter} onSelect={onSelect} />
        <MiniOnlineList onlineList={onlineList} />
      </Col>
      <Col className="col-8">
        <h1 className="pb-3">Filter: <small className="text-muted">{activeFilter}</small></h1>
        <ContentList
          tasks={taskList}
          onDelete={onDelete} onEdit={onEdit} onCheck={onCheck} onComplete={onComplete} filter={activeFilter} getTasks={handlePageChange}
          handler={myhandler} assignedTaskList={assignedTaskList}
        />
      </Col>
    </>
  )

}


const PublicMgr = (props) => {

  const { publicList, refreshPublic } = props;


  return (
    <>
      <Col className="col-8">
        <h1 className="pb-3">Public Tasks</h1>
        <PublicList
          tasks={publicList} getTasks={refreshPublic}
        />
      </Col>
    </>
  )

}


export default App;
