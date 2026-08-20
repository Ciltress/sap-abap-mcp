# Application log, locking and number ranges

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Application Log
- Locking
- Handling Number Ranges

---

## Application Log

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_BALI_LOG</code> </td>
<td>
For creating and reading application logs. Refer to <a href="https://help.sap.com/docs/btp/sap-business-technology-platform/application-logs">this documentation</a> for more information and code snippets. Note that there is also an XCO module available dealing with business application log (<code>XCO_CP_BAL</code>; see <a href="https://help.sap.com/docs/btp/sap-business-technology-platform/business-application-log">this documentation</a>).
<br><br>

``` abap
"Demo application job (sub)objects and external ID
"Note:
"- Refer to the documentation about how to create an application log object in ADT,
"  and for more options the classes offer in the context of application logs.
"- Required authorization for authorization object: S_APPL_LOG.
CONSTANTS: obj         TYPE cl_bali_header_setter=>ty_object VALUE 'DEMO_LOG',
           subobj      TYPE cl_bali_header_setter=>ty_subobject  VALUE 'DEMO_SUB',
           external_id TYPE cl_bali_header_setter=>ty_external_id VALUE 'DEMO_EXT_ID'.

"---- Creating (and deleting) application log entries ----
TRY.
    "Creating an instance of the application Log class
    DATA(appl_log) = cl_bali_log=>create( ).

    "Setting the header log, using application log object descriptions
    appl_log->set_header( header = cl_bali_header_setter=>create( object      = obj
                                                                  subobject   = subobj
                                                                  external_id = external_id ) ).

    "Before creating new application log entries, deleting existing ones based on the application
    "log object information and the user
    DATA(filter4del) = cl_bali_log_filter=>create( ).
    filter4del->set_create_info( user = xco_cp=>sy->user( )->name
                                )->set_descriptor( object      = obj
                                                   subobject   = subobj
                                                   external_id = external_id ).

    "Reading the logs from the database by applying the filter
    DATA(del_appl_log) = cl_bali_log_db=>get_instance( )->load_logs_w_items_via_filter( filter = filter4del ).
    "Deleting existing application log entries that are retrieved based on the applied filter
    LOOP AT del_appl_log INTO DATA(log_del).
      cl_bali_log_db=>get_instance( )->delete_log( log = log_del ).
    ENDLOOP.

  CATCH cx_bali_runtime.
ENDTRY.

TRY.
    "Creating new application log entries
    "Creating a free text and adding it to the application log
    DATA(free_txt) = cl_bali_free_text_setter=>create( severity = if_bali_constants=>c_category_free_text
                                                        text = |This text is added to the application log at { utclong_current( ) }| ).
    appl_log->add_item( item = free_txt ).

    "Creating an exception and adding it to the application log
    DATA(strtab) = VALUE string_table( ( `a` ) ( `b` ) ( `c` ) ).
    TRY.
        DATA(line) = strtab[ 4 ].
      CATCH cx_sy_itab_line_not_found INTO DATA(error).
    ENDTRY.
    DATA(exc) = cl_bali_exception_setter=>create( severity  = if_bali_constants=>c_category_exception
                                                  exception = error ).
    appl_log->add_item( item = exc ).

    "Saving the application log to the database
    cl_bali_log_db=>get_instance( )->save_log( log = appl_log ).
  CATCH cx_bali_runtime.
ENDTRY.

WAIT UP TO 1 SECONDS.

"---- Reading the application log ----
TRY.
    "Creating a filter
    "Only the messages from the current user based on the application log
    "object information and in the time frame now - 1 hour are retrieved.
    DATA(filter) = cl_bali_log_filter=>create( ).
    DATA(now) = utclong_current( ).
    DATA(anhourearlier) =  utclong_add( val = now
                                        hours = '1-' ).
    filter->set_create_info( user = xco_cp=>sy->user( )->name
                            )->set_descriptor( object      = obj
                                                subobject   = subobj
                                                external_id = external_id
                            )->set_time_interval( start_time = anhourearlier
                                                  end_time   = now ).

    "Reading the logs from the database by applying the filter
    DATA(log_table) = cl_bali_log_db=>get_instance( )->load_logs_w_items_via_filter( filter = filter ).

    "Processing the read result
    LOOP AT log_table INTO DATA(log).
      "Retrieving all items
      DATA(items) = log->get_all_items( ).
      "Retrieving the application log messages (and displaying)
      LOOP AT items INTO DATA(item).
        DATA(log_item_number) = item-log_item_number.
        DATA(msg) = item-item->get_message_text( ).
        "Displaying the entries when running a class
        "that implements the if_oo_adt_classrun interface
        "out->write( |{ log_item_number } { msg }| ).
      ENDLOOP.
    ENDLOOP.
  CATCH cx_bali_runtime.
ENDTRY.
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Locking

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_LOCK_OBJECT_FACTORY</code> </td>
<td>
For activating lock objects. Note that you can also use the <code>DEQUEUE_ALL</code> method to remove all locks in the current SAP LUW.
The following example code snippet uses artifacts from the ABAP cheat sheet repository.
<br><br>

``` abap
"Deleting demo database table
DELETE FROM zdemo_abap_rapt1.
"Creating a database table entry and reading it into a data reference variable
MODIFY zdemo_abap_rapt1 FROM @( VALUE #( key_field = 1 field1 = 'aaa' field2 = 'bbb' field3 = 2 field4 = 3 ) ).
SELECT SINGLE * FROM zdemo_abap_rapt1 WHERE key_field = 1 INTO NEW @DATA(key).

TRY.
    "Instantiating a lock object    
    DATA(lock) = cl_abap_lock_object_factory=>get_instance( iv_name = 'EZDEMO_ABAP_LOCK' ).

    "Enqueuing a lock object
    "Note that there are various parameters. The parameter used in the example contains
    "a list of lock fields including a reference to the parameter value.
    lock->enqueue( it_parameter = VALUE #( ( name = 'KEY_FIELD' value = REF #( key->key_field ) ) ) ).
  CATCH cx_abap_lock_failure cx_abap_foreign_lock INTO DATA(enq_error).
ENDTRY.

TRY.
    "Dequeuing a lock object
    lock->dequeue( it_parameter = VALUE #( ( name = 'KEY_FIELD' value = REF #( key->key_field ) ) ) ).
  CATCH cx_abap_lock_failure INTO DATA(deq_error).  
ENDTRY.
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Handling Number Ranges

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_NUMBERRANGE_OBJECTS</code><br><code>CL_NUMBERRANGE_INTERVALS</code><br><code>CL_NUMBERRANGE_RUNTIME</code> </td>
<td>

- Find more information in the SAP Help Portal, section [Number Range Solution](https://help.sap.com/docs/BTP/65de2977205c403bbc107264b8eccf4b/0335201e35bb433eab298bf8f389ea11.html), and in the class documentation.
- The code snippets rudimentarily show methods of the classes to retrieve information. You can find more snippets in the documentation linked above and check the various parameters.
 
<br>

```abap
"Use a valid number range object
DATA(numberrange_object) = 'Z.........'.

"Retrieving attributes of number range objects
TRY.
    cl_numberrange_objects=>read(
      EXPORTING
        object          = numberrange_object
      IMPORTING
        attributes      = DATA(attr)
        interval_exists = DATA(intv_exists)
        obj_text        = DATA(obj_text)
    ).
  CATCH cx_nr_object_not_found cx_number_ranges.
ENDTRY.

"Retrieving intervals of number range objects
TRY.
    cl_numberrange_intervals=>read(
      EXPORTING
        object       = numberrange_object
      IMPORTING
        interval     = DATA(intv)
    ).
  CATCH cx_nr_object_not_found cx_nr_subobject cx_number_ranges.
ENDTRY.

"Retrieving numbers from number range object intervals
TRY.
    cl_numberrange_runtime=>number_get(
      EXPORTING
        nr_range_nr       = '01'
        object            = numberrange_object
      IMPORTING
        number            = DATA(number)
        returncode        = DATA(rc)
        returned_quantity = DATA(quan)
    ).
  CATCH cx_nr_object_not_found cx_number_ranges.
ENDTRY.
``` 

</td>
</tr>


</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
