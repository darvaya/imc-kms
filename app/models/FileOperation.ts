import { computed, observable } from "mobx";
import type {
  FileOperationFormat,
  FileOperationState,
  FileOperationType,
} from "@shared/types";
import { bytesToHumanReadable } from "@shared/utils/files";
import { urlWithBasePath } from "@shared/utils/urls";
import User from "./User";
import Model from "./base/Model";
import Relation from "./decorators/Relation";

class FileOperation extends Model {
  static modelName = "FileOperation";

  @observable
  state: FileOperationState;

  name: string;

  error: string | null;

  collectionId: string | null;

  @observable
  size: number;

  type: FileOperationType;

  format: FileOperationFormat;

  @Relation(() => User)
  user: User;

  @computed
  get sizeInMB(): string {
    return bytesToHumanReadable(this.size);
  }

  @computed
  get downloadUrl(): string {
    // Opened directly via window.open (createExternalLinkAction), bypassing
    // ApiClient — so it must carry the deploy sub-path itself.
    return urlWithBasePath(`/api/fileOperations.redirect?id=${this.id}`);
  }
}

export default FileOperation;
