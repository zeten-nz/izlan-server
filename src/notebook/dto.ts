import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/**
 * Manba (hammasi ixtiyoriy). Dars berilsa — yo'nalish/mavzu undan olinadi va server o'quvchi darsga kira olishini
 * tekshiradi. Dars bo'lmasa — o'quvchi o'z yo'nalishi va (ochiq) mavzusini qo'lda tanlashi mumkin.
 */
export class SourceDto {
  @IsOptional()
  @IsUUID('all', { message: "Dars noto'g'ri" })
  lessonId?: string;

  @IsOptional()
  @IsUUID('all', { message: "Yo'nalish noto'g'ri" })
  directionId?: string;

  @IsOptional()
  @IsUUID('all', { message: "Mavzu noto'g'ri" })
  topicId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  pageId?: string;
}

export class ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID('all')
  directionId?: string;

  @IsOptional()
  @IsUUID('all')
  topicId?: string;

  @IsOptional()
  @IsIn(['new', 'old', 'az'], { message: "Saralash turi noto'g'ri" })
  sort?: 'new' | 'old' | 'az';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateVocabularyDto extends SourceDto {
  @IsString()
  @IsNotEmpty({ message: "So'z yoki atamani yozing" })
  @MaxLength(120, { message: "So'z 120 belgidan oshmasin" })
  term!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: "Ma'no 300 belgidan oshmasin" })
  meaning?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400, { message: "Misol gap 400 belgidan oshmasin" })
  example?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600, { message: "Izoh 600 belgidan oshmasin" })
  note?: string;

  /** true = shu so'z boshqa ma'noda bor, baribir qo'shish */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class UpdateVocabularyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "So'z yoki atamani yozing" })
  @MaxLength(120, { message: "So'z 120 belgidan oshmasin" })
  term?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: "Ma'no 300 belgidan oshmasin" })
  meaning?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400, { message: "Misol gap 400 belgidan oshmasin" })
  example?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600, { message: "Izoh 600 belgidan oshmasin" })
  note?: string;
}

export class CreateNoteDto extends SourceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: "Sarlavha 120 belgidan oshmasin" })
  title?: string;

  @IsString()
  @IsNotEmpty({ message: 'Eslatma matnini yozing' })
  @MaxLength(5000, { message: "Matn 5000 belgidan oshmasin" })
  body!: string;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: "Sarlavha 120 belgidan oshmasin" })
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Eslatma matnini yozing' })
  @MaxLength(5000, { message: "Matn 5000 belgidan oshmasin" })
  body?: string;
}

export class SaveMaterialDto {
  @IsUUID('all', { message: 'Dars tanlanmagan' })
  lessonId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  pageId?: string;
}

export class SavedStatusQueryDto {
  @IsUUID('all')
  lessonId!: string;
}

export class SavedListQueryDto {
  @IsOptional()
  @IsUUID('all')
  directionId?: string;

  @IsOptional()
  @IsUUID('all')
  topicId?: string;

  @IsOptional()
  @IsIn(['lesson', 'page'])
  kind?: 'lesson' | 'page';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class MistakesQueryDto {
  @IsOptional()
  @IsUUID('all')
  topicId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unresolvedOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
