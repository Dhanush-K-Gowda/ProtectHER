import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Switch,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  Button,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { database } from "../../firebase"; // Import the configured Firebase
import { ref, set, onValue } from "firebase/database";
import { Audio } from "expo-av";

export default function NightSupportScreen({ navigation }) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [location, setLocation] = useState(null);
  const [intervalId, setIntervalId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false); // State for microphone control
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef(null);

  const toggleSwitch = () => {
    setIsEnabled((previousState) => !previousState);
    if (!isEnabled) {
      startLocationUpdates();
    } else {
      stopLocationUpdates();
    }
  };

  const startLocationUpdates = async () => {
    setLoading(true);
    let { status: foregroundStatus } =
      await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== "granted") {
      Alert.alert(
        "Permission required",
        "Foreground location permission is required to use this feature."
      );
      setLoading(false);
      return;
    }

    if (intervalId) {
      clearInterval(intervalId);
    }

    try {
      const response = await fetch("http://192.168.29.34:5000/send-sms", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const result = await response.json();
      console.log("Alert sent:", result);
    } catch (error) {
      console.error("Error sending alert:", error);
    }

    const id = setInterval(async () => {
      try {
        let currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const { latitude, longitude } = currentLocation.coords;
        setLocation({ latitude, longitude });

        console.log("Location updated:", latitude, longitude);

        await set(ref(database, `locations/current`), {
          latitude,
          longitude,
        });
      } catch (error) {
        console.error("Error updating location:", error);
      }
    }, 10000);

    setIntervalId(id);
    setLoading(false);

    if (isMicEnabled) {
      startRecordingLoop(); // Start recording if microphone is enabled
    }
  };

  const stopLocationUpdates = () => {
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
    setLocation(null);
    stopRecordingLoop(); // Stop recording if location updates are stopped
  };

  const enableMic = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
      });
      setIsMicEnabled(true);
      setIsRecording(true); // Start recording when microphone is enabled
      Alert.alert(
        "Microphone Enabled",
        "Microphone recording has been enabled."
      );
      startRecordingLoop(); // Start recording loop
    } catch (error) {
      console.error("Error enabling microphone:", error);
      Alert.alert("Error", "Failed to enable microphone.");
    }
  };

  const stopMic = async () => {
    try {
      setIsMicEnabled(false);
      setIsRecording(false); // Stop recording when microphone is disabled
      stopRecordingLoop(); // Stop recording loop
      Alert.alert(
        "Microphone Stopped",
        "Microphone recording has been stopped."
      );
    } catch (error) {
      console.error("Error stopping microphone:", error);
      Alert.alert("Error", "Failed to stop microphone.");
    }
  };

  const recordAndSendAudio = async () => {
    let recording = recordingRef.current;

    try {
      if (!recording) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        recording = new Audio.Recording();
        await recording.prepareToRecordAsync(
          Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY
        );
        recordingRef.current = recording;
      }

      if (!isRecording) {
        await recording.startAsync();
        setIsRecording(true);
        console.log("Recording started");
      }

      await new Promise((resolve) => setTimeout(resolve, 15000)); // Record for 15 seconds

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      console.log("Recording stopped and stored at", uri);

      if (uri) {
        const formData = new FormData();
        formData.append("file", {
          uri,
          type: "audio/3gp",
          name: "file.3gp",
        });

        try {
          const response = await fetch("http://192.168.29.34:5000/predict", {
            method: "POST",
            body: formData,
          });

          // If needed, you can log the server response for debugging purposes
          // const result = await response.json();
          // console.log('Server response:', result);
        } catch (uploadError) {
          // Handle upload errors silently
          console.log("Failed to upload audio:", uploadError);
        }
      }

      // Wait for 5 seconds before starting the next recording
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (error) {
      // Handle recording errors silently
      console.log("Failed to record audio:", error);
    } finally {
      if (recording) {
        recording = null;
        recordingRef.current = null;
      }
    }
  };

  const startRecordingLoop = () => {
    if (!isRecording) {
      setIsRecording(true);
      setInterval(recordAndSendAudio, 20000); // 15s recording + 5s delay
    }
  };

  const stopRecordingLoop = () => {
    if (isRecording) {
      setIsRecording(false);
      clearInterval(recordAndSendAudio); // Stop the recording loop
    }
  };

  useEffect(() => {
    const locationRef = ref(database, `locations/current`);
    const unsubscribe = onValue(locationRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setLocation(data);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      stopRecordingLoop(); // Ensure recording stops when component unmounts
    };
  }, [intervalId]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Night Support Mode</Text>
      <Text style={styles.subtitle}>
        Toggle to enable night mode for better night-time safety.
      </Text>

      <Switch
        trackColor={{ false: "#767577", true: "#81b0ff" }}
        thumbColor={isEnabled ? "#f5dd4b" : "#f4f3f4"}
        style={{ transform: [{ scaleX: 3 }, { scaleY: 3 }] }}
        onValueChange={toggleSwitch}
        value={isEnabled}
      />

      {loading && <Text>Loading...</Text>}

      {location && (
        <View style={styles.locationContainer}>
          <Text style={styles.locationText}>Latitude: {location.latitude}</Text>
          <Text style={styles.locationText}>
            Longitude: {location.longitude}
          </Text>
        </View>
      )}

      <View style={styles.micControls}>
        <TouchableOpacity
          style={[
            styles.micButton,
            { backgroundColor: isMicEnabled ? "#d3d3d3" : "#b0b0b0" },
          ]} // Grey background, lighter when enabled
          onPress={enableMic}
          disabled={isMicEnabled}
        >
          <Text style={styles.micButtonText}>
            {isMicEnabled ? "Microphone Enabled" : "Enable Microphone"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.micButton}
          onPress={stopMic}
          disabled={!isMicEnabled}
        >
          <Text style={styles.micButtonText}>Stop Microphone</Text>
        </TouchableOpacity>
      </View>

      {/* Footer section */}
      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => navigation.navigate("Home")}
          style={styles.button}
        >
          <Ionicons name="home" size={24} color="#FF5A5F" />
          <Text style={styles.buttonText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("NightSupport")}
          style={styles.button}
        >
          <Ionicons name="moon" size={24} color="#FF5A5F" />
          <Text style={styles.buttonText}>Night Support</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("Profile")}
          style={styles.button}
        >
          <Ionicons name="person" size={24} color="#FF5A5F" />
          <Text style={styles.buttonText}>Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FF5A5F",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-around",
    position: "absolute",
    bottom: 0,
    width: "100%",
    padding: 10,
    backgroundColor: "#f8f8f8",
  },
  button: {
    alignItems: "center",
  },
  buttonText: {
    marginTop: 4,
    color: "#FF5A5F",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 30,
    textAlign: "center",
    paddingHorizontal: 5,
    paddingVertical: 25,
  },
  locationContainer: {
    marginTop: 20,
  },
  locationText: {
    color: "#FFFFFF",
  },
  micControls: {
    marginTop: 40, // Increased margin to place below other elements
    width: "80%", // Adjusted width for better alignment
    alignItems: "center",
  },
  micButton: {
    backgroundColor: "#d3d3d3", // Grey background color
    padding: 15, // Padding around the button text
    borderRadius: 10, // Rounded corners
    marginVertical: 10, // Vertical margin for spacing between buttons
    width: "100%", // Full width of the micControls container
  },
  micButtonText: {
    color: "#FFFFFF", // White text color
    textAlign: "center", // Center text
    fontSize: 16, // Font size for readability
  },
});

// import React, { useState, useEffect, useRef } from "react";
// import {
//   View,
//   Switch,
//   StyleSheet,
//   TouchableOpacity,
//   Text,
//   Alert,
// } from "react-native";
// import { Ionicons } from "@expo/vector-icons";
// import * as Location from "expo-location";
// import { database } from "../../firebase"; // Import the configured Firebase
// import { ref, set, onValue } from "firebase/database";
// import { Audio } from "expo-av";

// // Request microphone permission
// const requestMicPermission = async () => {
//   const { status } = await Audio.requestPermissionsAsync();
//   if (status !== "granted") {
//     Alert.alert(
//       "Permission required",
//       "Microphone permission is required to record audio."
//     );
//     return false;
//   }
//   return true;
// };

// export default function NightSupportScreen({ navigation }) {
//   const [isEnabled, setIsEnabled] = useState(false);
//   const [location, setLocation] = useState(null);
//   const [intervalId, setIntervalId] = useState(null);
//   const [loading, setLoading] = useState(false);
//   const [isMicEnabled, setIsMicEnabled] = useState(false);
//   const [isRecording, setIsRecording] = useState(false);
//   const recordingRef = useRef(null);

//   const toggleSwitch = () => {
//     setIsEnabled((previousState) => !previousState);
//     if (!isEnabled) {
//       startLocationUpdates();
//     } else {
//       stopLocationUpdates();
//     }
//   };

//   const startLocationUpdates = async () => {
//     setLoading(true);
//     let { status: foregroundStatus } =
//       await Location.requestForegroundPermissionsAsync();
//     if (foregroundStatus !== "granted") {
//       Alert.alert(
//         "Permission required",
//         "Foreground location permission is required to use this feature."
//       );
//       setLoading(false);
//       return;
//     }

//     if (intervalId) {
//       clearInterval(intervalId);
//     }

//     try {
//       const response = await fetch("http://192.168.144.23:5000/send-sms", {
//         method: "POST",
//       });
//       if (!response.ok) {
//         throw new Error(`HTTP error! Status: ${response.status}`);
//       }
//       const result = await response.json();
//       console.log("Alert sent:", result);
//     } catch (error) {
//       console.error("Error sending alert:", error);
//     }

//     const id = setInterval(async () => {
//       try {
//         let currentLocation = await Location.getCurrentPositionAsync({
//           accuracy: Location.Accuracy.High,
//         });

//         const { latitude, longitude } = currentLocation.coords;
//         setLocation({ latitude, longitude });

//         console.log("Location updated:", latitude, longitude);

//         await set(ref(database, `locations/current`), {
//           latitude,
//           longitude,
//         });
//       } catch (error) {
//         console.error("Error updating location:", error);
//       }
//     }, 10000);

//     setIntervalId(id);
//     setLoading(false);

//     if (isMicEnabled) {
//       startRecordingLoop(); // Start recording if microphone is enabled
//     }
//   };

//   const stopLocationUpdates = () => {
//     if (intervalId) {
//       clearInterval(intervalId);
//       setIntervalId(null);
//     }
//     setLocation(null);
//     stopRecordingLoop(); // Stop recording if location updates are stopped
//   };

//   const enableMic = async () => {
//     const hasPermission = await requestMicPermission();
//     if (!hasPermission) return;
//     try {
//       await Audio.setAudioModeAsync({
//         allowsRecordingIOS: true,
//         staysActiveInBackground: true,
//         playsInSilentModeIOS: true,
//       });
//       setIsMicEnabled(true);
//       setIsRecording(true); // Start recording when microphone is enabled
//       Alert.alert(
//         "Microphone Enabled",
//         "Microphone recording has been enabled."
//       );
//       startRecordingLoop(); // Start recording loop
//     } catch (error) {
//       console.error("Error enabling microphone:", error);
//       Alert.alert("Error", "Failed to enable microphone.");
//     }
//   };

//   const stopMic = async () => {
//     try {
//       setIsMicEnabled(false);
//       setIsRecording(false); // Stop recording when microphone is disabled
//       stopRecordingLoop(); // Stop recording loop
//       Alert.alert(
//         "Microphone Stopped",
//         "Microphone recording has been stopped."
//       );
//     } catch (error) {
//       console.error("Error stopping microphone:", error);
//       Alert.alert("Error", "Failed to stop microphone.");
//     }
//   };

//   const recordAndSendAudio = async () => {
//     let recording = recordingRef.current;

//     try {
//       if (!recording) {
//         recording = new Audio.Recording();
//         recordingRef.current = recording;

//         // Prepare the recorder
//         await recording.prepareToRecordAsync(
//           Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY
//         );
//       }

//       // Ensure the recording is prepared before starting
//       if (!isRecording) {
//         await recording.startAsync();
//         setIsRecording(true);
//         console.log("Recording started");
//       }

//       // Record for 15 seconds
//       await new Promise((resolve) => setTimeout(resolve, 15000));

//       // Stop the recording
//       await recording.stopAndUnloadAsync();
//       const uri = recording.getURI();
//       console.log("Recording stopped and stored at", uri);

//       // Upload the recording if the URI exists
//       if (uri) {
//         const formData = new FormData();
//         formData.append("file", {
//           uri,
//           type: "audio/3gp",
//           name: "file.3gp",
//         });

//         try {
//           const response = await fetch(" http://192.168.144.70:5000/predict", {
//             method: "POST",
//             body: formData,
//           });
//           // Optionally log the server response here
//         } catch (uploadError) {
//           console.error("Failed to upload audio:", uploadError);
//         }
//       }

//       // Wait 5 seconds before starting the next recording
//       await new Promise((resolve) => setTimeout(resolve, 5000));
//     } catch (error) {
//       console.error("Failed to record audio:", error);
//     } finally {
//       // Reset the recorder ref after use
//       if (recording) {
//         recording = null;
//         recordingRef.current = null;
//         setIsRecording(false);
//       }
//     }
//   };

//   const startRecordingLoop = () => {
//     if (!isRecording) {
//       setIsRecording(true);
//       const loopId = setInterval(recordAndSendAudio, 20000); // 15s recording + 5s delay
//       setIntervalId(loopId); // Store the interval ID
//     }
//   };

//   const stopRecordingLoop = () => {
//     if (isRecording) {
//       setIsRecording(false);
//       if (intervalId) {
//         clearInterval(intervalId); // Use the interval ID to clear the loop
//         setIntervalId(null);
//       }
//     }
//   };

//   useEffect(() => {
//     const locationRef = ref(database, `locations/current`);
//     const unsubscribe = onValue(locationRef, (snapshot) => {
//       const data = snapshot.val();
//       if (data) {
//         setLocation(data);
//       }
//     });

//     return () => {
//       unsubscribe();
//     };
//   }, []);

//   useEffect(() => {
//     return () => {
//       if (intervalId) {
//         clearInterval(intervalId);
//       }
//       stopRecordingLoop(); // Ensure recording stops when component unmounts
//     };
//   }, [intervalId]);

//   return (
//     <View style={styles.container}>
//       <Text style={styles.title}>Night Support Mode</Text>
//       <Text style={styles.subtitle}>
//         Toggle to enable night mode for better night-time safety.
//       </Text>

//       <Switch
//         trackColor={{ false: "#767577", true: "#81b0ff" }}
//         thumbColor={isEnabled ? "#f5dd4b" : "#f4f3f4"}
//         style={{ transform: [{ scaleX: 3 }, { scaleY: 3 }] }}
//         onValueChange={toggleSwitch}
//         value={isEnabled}
//       />

//       {loading && <Text>Loading...</Text>}

//       {location && (
//         <View style={styles.locationContainer}>
//           <Text style={styles.locationText}>Latitude: {location.latitude}</Text>
//           <Text style={styles.locationText}>
//             Longitude: {location.longitude}
//           </Text>
//         </View>
//       )}

//       <View style={styles.micControls}>
//         <TouchableOpacity
//           style={[
//             styles.micButton,
//             { backgroundColor: isMicEnabled ? "#d3d3d3" : "#b0b0b0" },
//           ]} // Grey background, lighter when enabled
//           onPress={enableMic}
//           disabled={isMicEnabled}
//         >
//           <Text style={styles.micButtonText}>
//             {isMicEnabled ? "Microphone Enabled" : "Enable Microphone"}
//           </Text>
//         </TouchableOpacity>
//         <TouchableOpacity
//           style={styles.micButton}
//           onPress={stopMic}
//           disabled={!isMicEnabled}
//         >
//           <Text style={styles.micButtonText}>Stop Microphone</Text>
//         </TouchableOpacity>
//       </View>

//       {/* Footer section */}
//       <View style={styles.footer}>
//         <TouchableOpacity
//           onPress={() => navigation.navigate("Home")}
//           style={styles.button}
//         >
//           <Ionicons name="home" size={24} color="#FF5A5F" />
//           <Text style={styles.buttonText}>Home</Text>
//         </TouchableOpacity>
//         <TouchableOpacity
//           onPress={() => navigation.navigate("NightSupport")}
//           style={styles.button}
//         >
//           <Ionicons name="moon" size={24} color="#FF5A5F" />
//           <Text style={styles.buttonText}>Night Support</Text>
//         </TouchableOpacity>
//         <TouchableOpacity
//           onPress={() => navigation.navigate("Profile")}
//           style={styles.button}
//         >
//           <Ionicons name="person" size={24} color="#FF5A5F" />
//           <Text style={styles.buttonText}>Profile</Text>
//         </TouchableOpacity>
//       </View>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     backgroundColor: "#FF5A5F",
//   },
//   footer: {
//     flexDirection: "row",
//     justifyContent: "space-around",
//     position: "absolute",
//     bottom: 0,
//     width: "100%",
//     padding: 10,
//     backgroundColor: "#f8f8f8",
//   },
//   button: {
//     alignItems: "center",
//   },
//   buttonText: {
//     marginTop: 4,
//     color: "#FF5A5F",
//   },
//   title: {
//     fontSize: 26,
//     fontWeight: "bold",
//     color: "#FFFFFF",
//     marginBottom: 10,
//   },
//   subtitle: {
//     fontSize: 16,
//     color: "#FFFFFF",
//     marginBottom: 30,
//     textAlign: "center",
//     paddingHorizontal: 5,
//     paddingVertical: 25,
//   },
//   locationContainer: {
//     marginTop: 20,
//   },
//   locationText: {
//     color: "#FFFFFF",
//   },
//   micControls: {
//     marginTop: 40, // Increased margin to place below other elements
//     width: "80%", // Adjusted width for better alignment
//     alignItems: "center",
//   },
//   micButton: {
//     backgroundColor: "#d3d3d3", // Grey background color
//     padding: 15, // Padding around the button text
//     borderRadius: 10, // Rounded corners
//     marginVertical: 10, // Vertical margin for spacing between buttons
//     width: "100%", // Full width of the micControls container
//   },
//   micButtonText: {
//     color: "#FFFFFF", // White text color
//     textAlign: "center", // Center text
//     fontSize: 16, // Font size for readability
//   },
// });
