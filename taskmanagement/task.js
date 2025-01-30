import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList,
  TextInput,
  Platform,
  Alert,
  Modal 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import DateTimePicker from '@react-native-community/datetimepicker';

const Stack = createStackNavigator();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Konum Tabanlı Görev Eklentisi
const LocationTaskFeature = {
  async getTaskLocation() {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Konum izni verilmedi');
        return null;
      }

      const location = await Location.getCurrentPositionAsync({});
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      };
    } catch (error) {
      console.error('Konum alınamadı:', error);
      return null;
    }
  }
};

// Ses Kaydı Yönetimi
const AudioRecordingManager = {
  async startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status === 'granted') {
        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
        await recording.startAsync();
        return recording;
      }
    } catch (error) {
      console.error('Ses kaydı hatası:', error);
    }
  },

  async stopRecording(recording) {
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      return uri;
    } catch (error) {
      console.error('Ses kaydı durdurma hatası:', error);
    }
  }
};

// Dosya Ekleme Yönetimi
const FileAttachmentManager = {
  async pickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true
      });

      if (result.type === 'success') {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        return {
          name: result.name,
          uri: result.uri,
          size: fileInfo.size
        };
      }
    } catch (error) {
      console.error('Dosya seçme hatası:', error);
    }
  },

  async saveFileToTaskDirectory(taskId, fileUri) {
    const taskDirectory = `${FileSystem.documentDirectory}tasks/${taskId}/`;
    await FileSystem.makeDirectoryAsync(taskDirectory, { intermediates: true });
    const fileName = fileUri.split('/').pop();
    const newPath = `${taskDirectory}${fileName}`;
    await FileSystem.copyAsync({ from: fileUri, to: newPath });
    return newPath;
  }
};

// Ana Ekran Bileşeni
const HomeScreen = ({ navigation }) => {
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isDetailsModalVisible, setDetailsModalVisible] = useState(false);
  const [recording, setRecording] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tümü');
  const [categories, setCategories] = useState(['Tümü']);
  const [showFilters, setShowFilters] = useState(false);



  useEffect(() => {
    loadTasks();

    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Bildirim alındı:', notification);
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Bildirime tıklandı:', response);
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, []);

  const loadTasks = async () => {
    try {
      const savedTasks = await AsyncStorage.getItem('tasks');
      if (savedTasks) {
        setTasks(JSON.parse(savedTasks));
      }
    } catch (error) {
      Alert.alert('Hata', 'Görevler yüklenirken bir hata oluştu');
    }
  };

  const getFilteredTasks = () => {
  return tasks.filter((task) => {
    const matchesSearch = task.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'Tümü' || task.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
};

  const SearchAndFilterComponent = () => (
  <View style={styles.searchContainer}>
    <TextInput
      style={styles.searchInput}
      placeholder="Görev ara..."
      value={searchQuery}
      onChangeText={setSearchQuery}
    />
    <TouchableOpacity
      style={styles.filterButton}
      onPress={() => setShowFilters(true)}>
      <Text style={styles.filterButtonText}>Filtrele</Text>
    </TouchableOpacity>
  </View>
);

  const FilterModal = () => (
  <Modal
    visible={showFilters}
    transparent={true}
    animationType="slide"
    onRequestClose={() => setShowFilters(false)}>
    <View style={styles.modalContainer}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Kategoriler</Text>
        {categories.map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryButton,
              selectedCategory === category && styles.selectedCategory,
            ]}
            onPress={() => {
              setSelectedCategory(category);
              setShowFilters(false);
            }}>
            <Text style={styles.categoryButtonText}>{category}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => setShowFilters(false)}>
          <Text style={styles.closeButtonText}>Kapat</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

  const deleteTask = async (id) => {
    try {
      
      const taskToDelete = tasks.find((task) => task.id === id);
      
      
      if (taskToDelete && taskToDelete.notificationId) {
        await Notifications.cancelScheduledNotificationAsync(
          taskToDelete.notificationId
        );
      }

      const newTasks = tasks.filter((task) => task.id !== id);
      setTasks(newTasks);
      await AsyncStorage.setItem('tasks', JSON.stringify(newTasks));
    } catch (error) {
      console.log('Görev silinirken hata:', error);
    }
  };
  

  const toggleTaskCompletion = async (taskId) => {
    const updatedTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, isChecked: !task.isChecked } : task
    );
    setTasks(updatedTasks);
    await AsyncStorage.setItem('tasks', JSON.stringify(updatedTasks));
  };

  const updateTaskWithExtras = async (taskId, extras) => {
    const updatedTasks = tasks.map(task => 
      task.id === taskId ? { ...task, ...extras } : task
    );
    setTasks(updatedTasks);
    await AsyncStorage.setItem('tasks', JSON.stringify(updatedTasks));
  };

  const handleAddLocation = async () => {
    if (!selectedTask) return;
    const location = await LocationTaskFeature.getTaskLocation();
    if (location) {
      await updateTaskWithExtras(selectedTask.id, { location });
      setDetailsModalVisible(false);
      Alert.alert('Başarılı', 'Konum göreve eklendi');
    }
  };

  const handleStartRecording = async () => {
    const newRecording = await AudioRecordingManager.startRecording();
    setRecording(newRecording);
  };

  const handleStopRecording = async () => {
    if (!recording || !selectedTask) return;
    const audioUri = await AudioRecordingManager.stopRecording(recording);
    if (audioUri) {
      await updateTaskWithExtras(selectedTask.id, { audioNote: audioUri });
      setRecording(null);
      setDetailsModalVisible(false);
      Alert.alert('Başarılı', 'Sesli not göreve eklendi');
    }
  };

  const handleAttachFile = async () => {
    if (!selectedTask) return;
    const pickedFile = await FileAttachmentManager.pickDocument();
    if (pickedFile) {
      const savedFileUri = await FileAttachmentManager.saveFileToTaskDirectory(
        selectedTask.id, 
        pickedFile.uri
      );
      await updateTaskWithExtras(selectedTask.id, { attachedFile: savedFileUri });
      setDetailsModalVisible(false);
      Alert.alert('Başarılı', 'Dosya göreve eklendi');
    }
  };

  
  const renderItem = ({ item }) => (
  <TouchableOpacity 
    style={styles.taskItem}
    onLongPress={() => {
      setSelectedTask(item);
      setDetailsModalVisible(true);
    }}
  >
    <TouchableOpacity
      style={[styles.checkbox, item.isChecked && styles.checked]}
      onPress={() => toggleTaskCompletion(item.id)}
    >
      {item.isChecked && <Text style={{ color: '#fff' }}>✔</Text>}
    </TouchableOpacity>

    <View style={styles.taskContent}>
      <Text style={[styles.taskTitle, item.isChecked && styles.completedText]}>
        {item.title}
      </Text>
      <Text style={styles.taskDetails}>
        Öncelik: {item.priority} | Kategori: {item.category || 'Belirtilmemiş'}
      </Text>
      <Text style={styles.taskDate}>
        Son Tarih: {new Date(item.deadline).toLocaleDateString()}
      </Text>
    </View>

    <TouchableOpacity
      onPress={() => deleteTask(item.id)}
      style={styles.deleteButton}
    >
      <Text style={styles.deleteText}>Sil</Text>
    </TouchableOpacity>
  </TouchableOpacity>
);
  

  return (
    <View style={styles.container}>
      <FlatList
        data={tasks}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={isDetailsModalVisible}
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Task Detayları</Text>
            
            <TouchableOpacity 
              style={styles.modalButton} 
              onPress={handleAddLocation}
            >
              <Text>📍 Konumu Ekle</Text>
            </TouchableOpacity>
            
            {!recording ? (
              <TouchableOpacity 
                style={styles.modalButton} 
                onPress={handleStartRecording}
              >
                <Text>🎙️ Sesli Not Başlat</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: 'red' }]} 
                onPress={handleStopRecording}
              >
                <Text>🛑 Ses Kaydını Durdur</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity 
              style={styles.modalButton} 
              onPress={handleAttachFile}
            >
              <Text>📎 Dosya Ekle</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.modalButton} 
              onPress={() => setDetailsModalVisible(false)}
            >
              <Text>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate('AddTask', { setTasks, tasks })}
      >
        <Text style={styles.addButtonText}>+ Yeni Görev</Text>
      </TouchableOpacity>
    </View>
  );
};

const AddTaskScreen = ({ route, navigation }) => {
  const { setTasks, tasks } = route.params;
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('Orta');
  const [deadline, setDeadline] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Uyarı', 'Bildirim izinleri verilmedi!');
      }
    })();
  }, []);

  const scheduleTaskNotification = async (taskTitle, taskDeadline) => {
    try {
      const trigger = new Date(taskDeadline);
      
      if (trigger <= new Date()) {
        return null;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Görev Hatırlatması',
          body: `"${taskTitle}" görevi için son gün!`,
          sound: true,
          priority: 'high',
        },
        trigger,
      });
      
      return notificationId;
    } catch (error) {
      console.log('Bildirim planlanırken hata:', error);
      return null;
    }
  };

  const addTask = async () => {
    if (!title.trim()) {
      Alert.alert('Hata', 'Lütfen görev başlığı girin');
      return;
    }

    try {
      const notificationId = await scheduleTaskNotification(title, deadline);

      const newTask = {
        id: Date.now(),
        title,
        category,
        priority,
        deadline,
        isChecked: false,
        notificationId
      };

      const newTasks = [...tasks, newTask];
      setTasks(newTasks);
      await AsyncStorage.setItem('tasks', JSON.stringify(newTasks));
      
      Alert.alert('Başarılı', 'Görev başarıyla eklendi ve bildirim planlandı');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Hata', 'Görev eklenirken bir sorun oluştu');
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Görev Başlığı"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={styles.input}
        placeholder="Kategori"
        value={category}
        onChangeText={setCategory}
      />
      <View style={styles.priorityContainer}>
        {['Düşük', 'Orta', 'Yüksek'].map((p) => (
          <TouchableOpacity
            key={p}
            style={[
              styles.priorityButton,
              priority === p && styles.selectedPriority
            ]}
            onPress={() => setPriority(p)}
          >
            <Text style={[
              styles.priorityText,
              priority === p && styles.selectedPriorityText
            ]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <TouchableOpacity
        style={styles.dateButton}
        onPress={() => setShowDatePicker(true)}
      >
        <Text>Son Tarih: {deadline.toLocaleDateString()}</Text>
      </TouchableOpacity>

      {showDatePicker && (
        <DateTimePicker
          value={deadline}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              setDeadline(selectedDate);
            }
          }}
        />
      )}

      <TouchableOpacity
        style={styles.submitButton}
        onPress={addTask}
      >
        <Text style={styles.submitButtonText}>Görevi Ekle</Text>
      </TouchableOpacity>
    </View>
  );
};


// Stil güncellemeleri
const styles = StyleSheet.create({
  // Genel Konteyner
  container: {
    flex: 10,
    padding: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Görev Öğesi Stilleri
  taskItem: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: 'white',
    borderRadius: 10,
    marginBottom: 10,
    alignItems: 'center',
    width: '90%', 
    alignSelf: 'center', 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },

  // Checkbox Stilleri
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#007AFF',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderRadius: 4, 
  },
  checked: {
    backgroundColor: '#007AFF', 
    borderColor: '#007AFF', 
  },

  // Görev İçerik Stilleri
  taskContent: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#888',
  },

  // Yeni Görev Ekleme Butonu Stilleri
  addButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    width: '90%',
    alignSelf: 'center',
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Girdi Alanları
  input: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    fontSize: 16,
    color: '#333',
  },

  // Öncelik Butonları Konteyner
  priorityContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  priorityButton: {
    flex: 1,
    padding: 10,
    backgroundColor: '#eee',
    borderRadius: 5,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  selectedPriority: {
    backgroundColor: '#007AFF',
  },
  priorityText: {
    color: '#333',
  },
  selectedPriorityText: {
    color: '#fff',
  },

  submitButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Modal Stilleri
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',  
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '90%',
    maxHeight: '70%',
    alignSelf: 'center',
  },
  modalButton: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 10,
    marginVertical: 5,
    alignItems: 'center',
  },
});

const additionalStyles = {
  searchContainer: {
    flexDirection: 'row',
    padding: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  filterButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 10,
    justifyContent: 'center',
  },
  filterButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  categoryButton: {
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    marginBottom: 10,
  },
  selectedCategory: {
    backgroundColor: '#007AFF',
  },
  categoryButtonText: {
    fontSize: 16,
  },
  deleteButton: {
    padding: 8,
  },
  deleteText: {
    color: 'red',
  }
};


export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'Görevlerim' }}
        />
        <Stack.Screen 
          name="AddTask" 
          component={AddTaskScreen} 
          options={{ title: 'Yeni Görev' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

