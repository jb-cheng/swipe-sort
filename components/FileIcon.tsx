import { View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { FileType } from '../lib/types';
import { FILE_META } from '../lib/fileHelpers';

interface Props {
  type: FileType;
  size?: number;
  color?: string;
}

export default function FileIcon({ type, size = 48, color = '#fff' }: Props) {
  const meta = FILE_META[type] ?? FILE_META.unknown;

  const iconProps = { size, color };

  return (
    <View style={styles.container}>
      {meta.family === 'Ionicons' && <Ionicons name={meta.icon as any} {...iconProps} />}
      {meta.family === 'FontAwesome' && <FontAwesome name={meta.icon as any} {...iconProps} />}
      {meta.family === 'MaterialIcons' && <MaterialIcons name={meta.icon as any} {...iconProps} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
