import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateLessonDto {
  @IsUUID('all', { message: 'Mavzu tanlanmagan' })
  topicId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Dars nomini yozing' })
  @MaxLength(120, { message: "Nom 120 belgidan oshmasin" })
  title!: string;
}

export class SaveDraftDto {
  /** Mijoz oxirgi ko'rgan qoralama raqami (optimistic lock) */
  @IsInt()
  @Min(1)
  rev!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Dars nomini yozing' })
  @MaxLength(120, { message: "Nom 120 belgidan oshmasin" })
  title?: string;

  @IsObject({ message: "Dars hujjati noto'g'ri" })
  doc!: Record<string, unknown>;
}

export class DuplicateLessonDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsUUID('all')
  topicId?: string;
}

export class PreviewAnswerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  blockId!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class LessonAnswerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  blockId!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class LessonVisitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  pageId!: string;
}
