const fs = require('fs');
const { Requester, AdapterError  } = require('@chainlink/external-adapter');
const toBuffer = require('it-to-buffer');
const ipfsClient = require('ipfs-http-client');
const defaultIpfsOptions = {
  'host': 'ipfs.infura.io', 
  'port': '5001', 
  'protocol': 'https'
};
let jobRunID = 1;


const throwError = (message) => {
  throw new AdapterError({
    jobRunID: jobRunID,
    statusCode: 400,
    message,
    cause: {},
  });
}

const success = (data) => {
  return {
    jobRunID,
    data: data,
    result: data,
    statusCode: 200,
  }
}

const Error = (message, code) => {
  return {
    jobRunID: jobRunID,
    status: "errored",
    statusCode: code,
    error: message
  }
}

const createRequest = async (input, callback) => {  // The Validator helps you validate the Chainlink request data
  jobRunID = input.id || 1; 
  const ipfs = ipfsClient.create(defaultIpfsOptions);
  
  switch(input.action) {
    case 'addEvent': 
      if ( !input.name || !input.eventId ) {
        return callback(400, Error("Must provide name and event ID", 400));
      }
      try {
        const jsonData = `{"id":"${input.eventId}", "name":"${input.name}", "description":"${input.description || ''}"}`;
        const result = await ipfs.add(jsonData);
        return callback(200, success(result));  
      } catch (error) {
        console.log("ERR", error);
        return callback(error.statusCode || 500, Requester.errored(jobRunId, error, error.statusCode));
      };
      break;

    case 'addRegistration': 
      if ( !input.name || !input.email || !input.registrationId ) {
        return callback(400, Error("Must provide name, encrypted email, and registration ID", 400));
      }
      try {
        const jsonData = `{"id":"${input.registrationId}", "name":"${input.name}", "company":"${input.company || ''}", "email":"${input.email}"}`;
        const result = await ipfs.add(jsonData);
        return callback(200, success(result));  
      } catch (error) {
        console.log("ERR", error);
        return callback(error.statusCode || 500, Requester.errored(jobRunId, error, error.statusCode));
      };
      break;

    case 'getEntity': 
      if ( !input.cid ) {
        return callback(400, Error("Must provide CID", 400));
      }
      const contents = await toBuffer(ipfs.cat(input.cid));
      const file = JSON.parse(Buffer.from(contents.buffer).toString());
      return callback(200, success(file)); 
      break;
  }

  return callback(400, Error("Action not recognized", 400));
}

// This is a wrapper to allow the function to work with
// GCP Functions
exports.gcpservice = (req, res) => {
  createRequest(req.body, (statusCode, data) => {
    res.status(statusCode).send(data)
  })
}

// This is a wrapper to allow the function to work with
// AWS Lambda
exports.handler = (event, context, callback) => {
  createRequest(event, (statusCode, data) => {
    callback(null, data)
  })
}

// This is a wrapper to allow the function to work with
// newer AWS Lambda implementations
exports.handlerv2 = (event, context, callback) => {
  createRequest(JSON.parse(event.body), (statusCode, data) => {
    callback(null, {
      statusCode: statusCode,
      body: JSON.stringify(data),
      isBase64Encoded: false
    })
  })
}

// This allows the function to be exported for testing
// or for running in express
module.exports.createRequest = createRequest
