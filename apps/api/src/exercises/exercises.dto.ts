import { Allow, IsArray, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class UpdateExerciseDraftDto {
  @IsInt() @Min(0) expectedRevision: number;
  @IsArray() @Allow() sections: unknown[];
  @IsArray() @Allow() questions: unknown[];
}
export class ImportExerciseDto {
  @IsString() @MaxLength(1_048_576) source: string;
  @IsOptional() @IsString() @MaxLength(255) sourceName?: string;
}
export class CommitImportDto extends ImportExerciseDto {
  @IsOptional() @IsString() assignmentId?: string;
  @IsOptional() @IsString() deadlineAt?: string;
}
export class SaveAnswersDto {
  @IsInt() @Min(0) expectedRevision: number;
  @IsArray() @Allow() answers: unknown[];
}
export class ManualGradeDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100000) manualPoints: number;
}
